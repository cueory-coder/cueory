/**
 * Staging auto-merge rules (D-39). Pure functions only: no network, so every rule is unit tested.
 *
 * A pull request is merged into `staging` only when ALL of these hold:
 * - it is open, not a draft, comes from this repository (not a fork) and targets `staging`;
 * - it changes no sensitive path (those get the "needs-christian" label instead and are never merged by the bot);
 * - every required check on its head commit passed, and no other check failed;
 * - Codex's latest review summary is for that exact head commit, finished, and reports no findings;
 * - GitHub says it merges cleanly.
 * It never targets `main`: the merge call itself refuses any base other than `staging` (see staging_automerge.ts).
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

/**
 * Paths only Christian may approve. The brief's list, plus three more for the same reason: the auto-merge rules
 * themselves, the Node version every build uses, and the newsletter form settings (AGENTS.md sensitive areas).
 */
const SENSITIVE_PREFIXES = ['.github/', 'supabase/', 'brand-source/', 'public/brand/', 'scripts/automerge/'];
const SENSITIVE_FILES = new Set([
  'public/_headers',
  'astro.config.mjs',
  'wrangler.jsonc',
  'SECURITY.md',
  'CLAUDE.md',
  'AGENTS.md',
  'package.json',
  'package-lock.json',
  'scripts/staging_automerge.ts',
  '.node-version',
  'src/config/site.ts',
]);
/** A dependency list anywhere in the tree counts, not just the root one. */
const SENSITIVE_BASENAMES = new Set(['package.json', 'package-lock.json']);

/** GitHub's file list stops at 3,000 files; a pull request that big is never merged by the bot. */
export const MAX_LISTED_FILES = 3000;

export interface PullRequest {
  number: number;
  state: string;
  draft: boolean;
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

export function isSensitivePath(path: string): boolean {
  if (SENSITIVE_FILES.has(path)) return true;
  if (SENSITIVE_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  const base = path.slice(path.lastIndexOf('/') + 1);
  return SENSITIVE_BASENAMES.has(base);
}

/** Every sensitive path a pull request touches, counting both sides of a rename. */
export function sensitivePaths(files: readonly ChangedFile[]): string[] {
  const hits = new Set<string>();
  for (const f of files) {
    for (const path of [f.filename, f.previous_filename]) {
      if (path && isSensitivePath(path)) hits.add(path);
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
  pr: PullRequest;
  files: readonly ChangedFile[];
  checks: readonly CheckRun[];
  comments: readonly IssueComment[];
}

export function decide({ repo, pr, files, checks, comments }: DecideInput): Decision {
  if (pr.state !== 'open') return { action: 'skip', reasons: ['not open'] };
  if (pr.base.ref !== BASE_BRANCH) return { action: 'skip', reasons: [`targets ${pr.base.ref}, not ${BASE_BRANCH}`] };
  if (pr.head.repo?.full_name !== repo) return { action: 'skip', reasons: ['comes from another repository'] };
  if (pr.draft) return { action: 'skip', reasons: ['still a draft'] };

  const sensitive = sensitivePaths(files);
  if (sensitive.length > 0) return { action: 'label', reasons: [`needs Christian: changes ${sensitive.join(', ')}`] };
  if (files.length >= MAX_LISTED_FILES) {
    return { action: 'label', reasons: ['needs Christian: too many files for the bot to check'] };
  }

  const problems = [...checkProblems(checks), ...codexProblems(codexState(comments), pr.head.sha)];
  if (pr.mergeable === null) problems.push('GitHub is still checking whether it merges cleanly');
  else if (!pr.mergeable) problems.push("it doesn't merge cleanly into staging");
  if (problems.length > 0) return { action: 'wait', reasons: problems };

  return { action: 'merge', reasons: ['checks passed, Codex is clean, nothing sensitive'] };
}
