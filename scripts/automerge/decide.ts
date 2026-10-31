/**
 * Staging auto-merge rules (D-39, pre-launch mode D-42). Pure functions only: no network, so every rule is unit tested.
 *
 * A pull request is merged into `staging` only when ALL of these hold:
 * - it is open, not a draft, comes from this repository (not a fork) and targets `staging`;
 * - it changes no held path for the current mode and isn't labelled "needs-christian" (those wait for Christian and
 *   are never merged by the bot);
 * - before launch, its package.json changes add no dependency and change no major version (read from the files
 *   themselves, never from the title);
 * - every required check on its head commit passed, and no other check failed;
 * - Codex's latest review summary is for that exact head commit, finished, and reports no findings;
 * - GitHub says it merges cleanly.
 * It never targets `main`: the merge call itself refuses any base other than `staging` (see staging_automerge.ts).
 *
 * The mode comes from automation.json at the repository root (parseAutomation below). Before launch only the paths
 * that must always be Christian's are held; once the site is live, the longer sensitive list is held too.
 */

export const BASE_BRANCH = 'staging';
export const NEEDS_CHRISTIAN_LABEL = 'needs-christian';
export const CODEX_LOGIN = 'chatgpt-codex-connector[bot]';

/** Checks that must have run and passed on the head commit (names as GitHub shows them). */
export const REQUIRED_CHECKS = [
  'Type check, build and test',
  'Scan for leaked secrets',
  'Scan code for security issues (Semgrep)',
  'Workers Builds: cueory',
] as const;

/** "prelaunch" until Christian says the site is live for students (automation.json). */
export type Mode = 'prelaunch' | 'launched';

/**
 * Held in both modes (D-42):
 * - `.github/`: GitHub doesn't let the automation's own token change workflow files, and they are the automation;
 * - `automation.json` and the auto-merge's own code, so a robot can never loosen its own rules;
 * - `CLAUDE.md`, `AGENTS.md` and `SECURITY.md`: the rules the AI builders and reviewers follow, which only Christian
 *   changes;
 * - `content/`: real lessons, questions and cards need Christian's approval, and the bot can't tell them from
 *   placeholders;
 * - `supabase/` (sign-in and database policies) and `wrangler.jsonc` (deployment), which CLAUDE.md rule 3 reserves
 *   for Christian.
 */
const ALWAYS_HELD_PREFIXES = ['.github/', 'scripts/automerge/', 'content/', 'supabase/'];
const ALWAYS_HELD_FILES = new Set([
  'automation.json',
  'scripts/staging_automerge.ts',
  'CLAUDE.md',
  'AGENTS.md',
  'SECURITY.md',
  'wrangler.jsonc',
]);

/**
 * Also held once the site is live: the rest of the brief's sensitive list, plus the Node version every build uses and
 * the newsletter form settings (AGENTS.md sensitive areas).
 */
const LAUNCHED_HELD_PREFIXES = ['brand-source/', 'public/brand/'];
const LAUNCHED_HELD_FILES = new Set(['public/_headers', 'astro.config.mjs', '.node-version', 'src/config/site.ts']);
/** A dependency list anywhere in the tree counts, not just the root one. */
const LAUNCHED_HELD_BASENAMES = new Set(['package.json', 'package-lock.json']);

/** GitHub's file list stops at 3,000 files; a pull request that big is never merged by the bot. */
export const MAX_LISTED_FILES = 3000;

export interface PullRequest {
  number: number;
  state: string;
  draft: boolean;
  title: string;
  user: { login: string } | null;
  /** null while GitHub is still working it out. */
  mergeable: boolean | null;
  base: { ref: string };
  head: { sha: string; ref: string; repo: { full_name: string } | null };
  labels: { name: string }[];
}

export interface ChangedFile {
  filename: string;
  /** Set when the file was renamed. */
  previous_filename?: string;
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export interface IssueComment {
  id: number;
  body?: string;
  updated_at: string;
  user: { login: string; type: string } | null;
}

export interface CodexState {
  code_review?: { commit_sha: string | null; status: string | null; has_any_findings: boolean | null; has_unresolved_findings: boolean | null };
  security_review?: { commit_sha: string | null; status: string | null; has_any_findings: boolean | null; has_unresolved_findings: boolean | null };
}

export type Action = 'merge' | 'label' | 'wait' | 'skip';

export interface Decision {
  action: Action;
  /** Plain-English reasons, shown in the workflow log. */
  reasons: string[];
}

/**
 * The mode from automation.json's text (undefined when the file is missing). Anything but a clear
 * `"prelaunch": true` gives the stricter launched rules, with a note saying why.
 */
export function parseAutomation(text: string | undefined): { mode: Mode; note?: string } {
  if (text === undefined) return { mode: 'launched', note: 'automation.json is missing, so the launched rules apply' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { mode: 'launched', note: "automation.json isn't valid JSON, so the launched rules apply" };
  }
  const prelaunch = parsed && typeof parsed === 'object' ? (parsed as { prelaunch?: unknown }).prelaunch : undefined;
  if (prelaunch === true) return { mode: 'prelaunch' };
  if (prelaunch === false) return { mode: 'launched' };
  return { mode: 'launched', note: 'automation.json has no true/false "prelaunch" setting, so the launched rules apply' };
}

export function isHeldPath(path: string, mode: Mode): boolean {
  if (ALWAYS_HELD_FILES.has(path) || ALWAYS_HELD_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (mode === 'prelaunch') return false;
  if (LAUNCHED_HELD_FILES.has(path) || LAUNCHED_HELD_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return LAUNCHED_HELD_BASENAMES.has(path.slice(path.lastIndexOf('/') + 1));
}

/** Every held path a pull request touches, counting both sides of a rename. */
export function heldPaths(files: readonly ChangedFile[], mode: Mode): string[] {
  const hits = new Set<string>();
  for (const f of files) {
    for (const path of [f.filename, f.previous_filename]) {
      if (path && isHeldPath(path, mode)) hits.add(path);
    }
  }
  return [...hits].sort();
}

/** The dependency lists in a package.json. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

/**
 * The part of a version that marks a breaking change: "^7.4.4" → "7", "4.156.0" → "4", and below 1.0 the minor
 * version too ("^0.9.12" → "0.9"). Null when the text has no version number.
 */
export function majorOf(spec: string): string | null {
  const m = /(\d+)(?:\.(\d+))?/.exec(spec);
  if (!m) return null;
  return m[1] === '0' && m[2] !== undefined ? `0.${m[2]}` : m[1]!;
}

/** A package.json a pull request changes: its text on the base branch and in the pull request. */
export interface DependencyFile {
  path: string;
  /** null when the file doesn't exist on that side; undefined when it couldn't be read. */
  before: string | null | undefined;
  after: string | null | undefined;
}

function dependencyMap(text: string | null): Map<string, string> | undefined {
  if (text === null) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const map = new Map<string, string>();
  for (const field of DEPENDENCY_FIELDS) {
    const list = (parsed as Record<string, unknown>)[field];
    if (!list || typeof list !== 'object') continue;
    for (const [name, spec] of Object.entries(list as Record<string, unknown>)) {
      map.set(`${field}:${name}`, String(spec));
    }
  }
  return map;
}

/**
 * What in a pull request's package.json changes waits for Christian before launch (D-42): a new dependency (it
 * could be a paid service, and every package is code we run) and any major version change (TypeScript 7 and
 * @types/node above Node 24 are never accepted, D-01, D-02). It reads the files themselves, so a pull request's
 * title can't hide an update. A file it can't read waits too.
 */
export function dependencyHolds(files: readonly DependencyFile[]): string[] {
  const reasons: string[] = [];
  for (const { path, before, after } of files) {
    if (before === undefined || after === undefined) {
      reasons.push(`couldn't read ${path}`);
      continue;
    }
    const old = dependencyMap(before);
    const now = dependencyMap(after);
    if (!old || !now) {
      reasons.push(`couldn't read the dependencies in ${path}`);
      continue;
    }
    for (const [key, spec] of now) {
      const name = key.slice(key.indexOf(':') + 1);
      const was = old.get(key);
      if (was === undefined) reasons.push(`adds ${name}`);
      else if (was !== spec) {
        const from = majorOf(was);
        if (from === null || from !== majorOf(spec)) reasons.push(`${name} ${was} to ${spec}`);
      }
    }
  }
  return [...new Set(reasons)];
}

/** Every package.json a pull request touches, counting both sides of a rename (the files to read for dependencyHolds). */
export function dependencyPaths(files: readonly ChangedFile[]): string[] {
  const hits = new Set<string>();
  for (const f of files) {
    for (const path of [f.filename, f.previous_filename]) {
      if (path && path.slice(path.lastIndexOf('/') + 1) === 'package.json') hits.add(path);
    }
  }
  return [...hits].sort();
}

/** The newest run of each check name (a re-run replaces the earlier result). */
export function latestChecks(checks: readonly CheckRun[]): Map<string, CheckRun> {
  const latest = new Map<string, CheckRun>();
  for (const run of checks) {
    const seen = latest.get(run.name);
    if (!seen || run.id > seen.id) latest.set(run.name, run);
  }
  return latest;
}

const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

/** Problems with the head commit's checks, or an empty list when everything required passed. */
export function checkProblems(checks: readonly CheckRun[]): string[] {
  const latest = latestChecks(checks);
  const problems: string[] = [];
  for (const name of REQUIRED_CHECKS) {
    const run = latest.get(name);
    if (!run) problems.push(`"${name}" hasn't reported yet`);
    else if (run.status !== 'completed') problems.push(`"${name}" is still running`);
    else if (run.conclusion !== 'success') problems.push(`"${name}" ended as ${run.conclusion ?? 'unknown'}`);
  }
  for (const [name, run] of latest) {
    if ((REQUIRED_CHECKS as readonly string[]).includes(name)) continue;
    if (run.status === 'completed' && !OK_CONCLUSIONS.has(run.conclusion ?? '')) {
      problems.push(`"${name}" ended as ${run.conclusion ?? 'unknown'}`);
    }
  }
  return problems;
}

const STATE_MARKER = /<!--\s*codex-review-state:v1\s*(\{[\s\S]*?\})\s*-->/;

/**
 * Codex's own review state, from the newest summary comment Codex posted. Comments by anyone else are ignored, so a
 * person can't fake a clean review by pasting the marker. Returns null when there is no readable summary.
 */
export function codexState(comments: readonly IssueComment[]): CodexState | null {
  const fromCodex = comments
    .filter((c) => c.user?.login === CODEX_LOGIN && c.user.type === 'Bot' && c.body && STATE_MARKER.test(c.body))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id - b.id);
  const newest = fromCodex.at(-1);
  if (!newest?.body) return null;
  try {
    const parsed: unknown = JSON.parse(STATE_MARKER.exec(newest.body)![1]!);
    return parsed && typeof parsed === 'object' ? (parsed as CodexState) : null;
  } catch {
    return null;
  }
}

/** Problems with Codex's review of this head commit, or an empty list when it is a clean, finished review. */
export function codexProblems(state: CodexState | null, headSha: string): string[] {
  const review = state?.code_review;
  if (!review) return ["Codex hasn't posted a review summary yet"];
  if (review.commit_sha !== headSha) return ["Codex hasn't reviewed the latest commit yet"];
  if (review.status !== 'completed') return ['Codex is still reviewing'];
  const problems: string[] = [];
  if (review.has_any_findings !== false) problems.push('Codex found something to look at');
  if (review.has_unresolved_findings !== false) problems.push('Codex has unresolved findings');
  const security = state?.security_review;
  if (security?.commit_sha === headSha && (security.has_unresolved_findings === true || security.status === 'running')) {
    problems.push('Codex security review is open');
  }
  return problems;
}

export interface DecideInput {
  repo: string;
  mode: Mode;
  pr: PullRequest;
  files: readonly ChangedFile[];
  /** Every package.json the pull request touches, read on both sides (see dependencyPaths). */
  dependencies: readonly DependencyFile[];
  checks: readonly CheckRun[];
  comments: readonly IssueComment[];
}

export function decide({ repo, mode, pr, files, dependencies, checks, comments }: DecideInput): Decision {
  if (pr.state !== 'open') return { action: 'skip', reasons: ['not open'] };
  if (pr.base.ref !== BASE_BRANCH) return { action: 'skip', reasons: [`targets ${pr.base.ref}, not ${BASE_BRANCH}`] };
  if (pr.head.repo?.full_name !== repo) return { action: 'skip', reasons: ['comes from another repository'] };
  if (pr.draft) return { action: 'skip', reasons: ['still a draft'] };

  // Anyone may hold a pull request for Christian by adding the label (for example sign-in or payment work).
  if (pr.labels.some((l) => l.name === NEEDS_CHRISTIAN_LABEL)) {
    return { action: 'label', reasons: [`needs Christian: labelled ${NEEDS_CHRISTIAN_LABEL}`] };
  }
  const held = heldPaths(files, mode);
  if (held.length > 0) return { action: 'label', reasons: [`needs Christian: changes ${held.join(', ')}`] };
  if (files.length >= MAX_LISTED_FILES) {
    return { action: 'label', reasons: ['needs Christian: too many files for the bot to check'] };
  }
  const deps = dependencyHolds(dependencies);
  if (deps.length > 0) return { action: 'label', reasons: [`needs Christian: dependency changes (${deps.join('; ')})`] };

  const problems = [...checkProblems(checks), ...codexProblems(codexState(comments), pr.head.sha)];
  if (pr.mergeable === null) problems.push('GitHub is still checking whether it merges cleanly');
  else if (!pr.mergeable) problems.push("it doesn't merge cleanly into staging");
  if (problems.length > 0) return { action: 'wait', reasons: problems };

  return { action: 'merge', reasons: [`checks passed, Codex is clean, nothing held (${mode} rules)`] };
}
