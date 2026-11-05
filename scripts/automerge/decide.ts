/**
 * Staging auto-merge rules (D-39, pre-launch mode D-42). Pure functions only: no network, so every rule is unit tested.
 *
 * A pull request is merged into `staging` only when ALL of these hold:
 * - it is open, not a draft, comes from this repository (not a fork) and targets `staging`;
 * - it changes no held path for the current mode and isn't labelled "needs-christian" (those wait for Christian and
 *   are never merged by the bot);
 * - before launch, its package.json changes add no dependency, change no major version and leave the scripts, engines
 *   and packageManager alone, and its package-lock.json changes add no package, no install script and no download
 *   outside the npm registry (all read from the files themselves, never from the title);
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
  // Require the GitHub Advanced Security verdict, not just the successful CodeQL analysis workflow.
  'CodeQL',
  'Workers Builds: cueory',
] as const;

/** Trusted publishers verified against this repository's exact-head GitHub check-runs.
 * Checking a display name alone lets an unrelated check-writing integration impersonate a required gate.
 */
const REQUIRED_CHECK_APP: Record<(typeof REQUIRED_CHECKS)[number], string> = {
  'Type check, build and test': 'github-actions',
  'Scan for leaked secrets': 'github-actions',
  'Scan code for security issues (Semgrep)': 'github-actions',
  CodeQL: 'github-advanced-security',
  'Workers Builds: cueory': 'cloudflare-workers-and-pages',
};

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
const ALWAYS_HELD_PREFIXES = [
  '.github/', 'scripts/automerge/', 'content/', 'supabase/',
  'public/models/anatomy/', // Founder reviews every 3D model binary before it reaches staging.
  'src/pages/auth/', 'src/pages/account/', 'src/pages/admin/', 'src/pages/preview/admin-',
];
const ALWAYS_HELD_FILES = new Set([
  'automation.json',
  'scripts/staging_automerge.ts',
  'CLAUDE.md',
  'AGENTS.md',
  'SECURITY.md',
  'wrangler.jsonc',
  // Header/CSP changes affect browser security, including before public launch.
  'public/_headers',
  'astro.config.mjs',
  // These legal/anatomy release gates decide whether draft material is shipped publicly.
  'scripts/check-legal-release.mjs',
  'scripts/anatomy-production-audit.mjs',
  'scripts/check-anatomy-build.mjs',
  'scripts/anatomy-postbuild-audit.mjs', // alternative production postbuild wrapper in PR #626
  'src/islands/anatomylab.ts', // Chooses draft versus approved data for build output.
  'src/islands/AnatomyLab.tsx', // Shows draft warnings, model attribution and export credits.
  'src/islands/anatomyscene.ts', // Renders mandatory source credits in exported anatomy PNGs.
  'src/pages/preview/anatomy-lab.astro', // Serializes the model selection into the page.
  'scripts/build-anatomy.mjs', // Source-driven geometry and label generation.
  'scripts/anatomy-systems.json', // Model source selection and layer definitions.
  'src/visuals/prunedrafts.ts',
  'src/visuals/sources.ts',
  // Founder approval is required for changes to secret-scan exceptions/config.
  '.gitleaksignore',
  '.gitleaks.toml',
  // Legal/SEO release controls remain founder-held while their copy is in draft.
  'src/pages/privacy.astro',
  'src/pages/terms.astro',
  'src/pages/disclaimer.astro',
  'src/config/routes.ts',
  // Account session/menu and newsletter form code are security-sensitive even before launch.
  'src/config/site.ts',
  'src/components/AccountCorner.astro',
  'src/components/SignupForm.astro',
  'src/scripts/accountcorner.ts',
  'src/scripts/studyeventqueue.ts', // may pass signed-in study events to an RPC sender
  'src/islands/questions.ts', // ensures public question state rejects pre-attempt answer keys
  'src/islands/flag.ts', // validates authenticated student report payloads
  'src/pages/learn/questions.astro', // publishes the signed-in question practice entry point
  'src/scripts/progress.ts', // holds local onboarding answers later imported into an account
]);

/**
 * Account, authentication and privileged-admin code requires founder review in BOTH modes.
 * These directories hold route entrypoints, while the flat islands folder uses narrow
 * feature stems to include future helper modules without blocking ordinary study islands.
 */
const SENSITIVE_AUTH_PAGES = new Set([
  'src/pages/account.astro',
  'src/pages/signin.astro',
  'src/pages/signup.astro',
  'src/pages/reset-password.astro',
  'src/pages/start.astro',
  'src/pages/progress.astro', // shows signed-in exam data and student export controls
]);
  // RPC bridges and signed-in progress sync are security boundaries too.
const SENSITIVE_AUTH_ISLAND_STEMS = [
  'account', 'admin', 'auth', 'checkanswer', 'deleteaccount', 'displayname',
  'examplan', 'exportdata', 'exportload', 'flagconnect', 'flagform', 'flaginbox',
  'flagmount', 'flagsend', 'flagsubmit', 'flagitem',
  'guestimport', 'mfa', 'oauth',
  'onboarding', 'password', 'pkce', 'progresspanel', 'publishedquestions',
  'questionsplayer', 'questionsremote', 'recovery', 'resetpassword',
  'rpcerrors', 'reviewsession', 'reviewsync', 'session', 'signin', 'signup', 'studyrecorder', 'supabase', 'twofactor',
];

function isSensitiveAuthSource(path: string): boolean {
  if (SENSITIVE_AUTH_PAGES.has(path)) return true;
  if (!path.startsWith('src/islands/')) return false;
  const filename = path.slice('src/islands/'.length).toLowerCase();
  return SENSITIVE_AUTH_ISLAND_STEMS.some((stem) => filename.startsWith(stem));
}

/**
 * Also held once the site is live: the rest of the brief's sensitive list, plus the Node version every build uses and
 * the newsletter form settings (AGENTS.md sensitive areas).
 */
const LAUNCHED_HELD_PREFIXES = ['brand-source/', 'public/brand/'];
const LAUNCHED_HELD_FILES = new Set(['.node-version']);
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
  base: { ref: string; sha?: string };
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
  /** GitHub check-run publisher, used to verify the CodeQL verdict's origin. */
  app?: { slug?: string };
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
  if (ALWAYS_HELD_FILES.has(path) || ALWAYS_HELD_PREFIXES.some((prefix) => path.startsWith(prefix)) || isSensitiveAuthSource(path)) return true;
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

/**
 * Fields that run code or pick the toolchain in every install and build (D-52): any change, addition or removal waits,
 * before launch too.
 */
const GUARDED_FIELDS = ['scripts', 'engines', 'packageManager'] as const;
/** Where every npm download must come from. */
const NPM_REGISTRY = 'https://registry.npmjs.org/';

/** The dependency lists in a package.json. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;
/** Fields that can swap a package's version anywhere in the tree (npm, Yarn, pnpm): any change to them waits. */
const OVERRIDE_FIELDS = ['overrides', 'resolutions', 'pnpm'] as const;

/**
 * A version the bot can size: one exact version, or one with a caret or tilde in front ("^7.4.4", "~6.0.3",
 * "4.156.0", "^1.2.3-beta.1"). Each allows exactly one major version. Ranges such as ">=6", "6.x", "*",
 * "^6 || ^7", tags, links and aliases could allow another one, so they can't be sized.
 */
const SIZEABLE = /^[\^~]?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

/**
 * The part of a version that marks a breaking change: "^7.4.4" → "7", "4.156.0" → "4", and below 1.0 the minor
 * version too ("^0.9.12" → "0.9"). Null when the version can't be sized (see SIZEABLE).
 */
export function majorOf(spec: string): string | null {
  const m = SIZEABLE.exec(spec.trim());
  if (!m) return null;
  return m[1] === '0' ? `0.${m[2]}` : m[1]!;
}

/** A package.json or package-lock.json a pull request changes: its text on the base branch and in the pull request. */
export interface DependencyFile {
  path: string;
  /** null when the file doesn't exist on that side; undefined when it couldn't be read. */
  before: string | null | undefined;
  after: string | null | undefined;
}

interface PackageFacts {
  /** "devDependencies:typescript" → "^6.0.3". */
  versions: Map<string, string>;
  /** The override fields, as text, to see whether they changed. */
  overrides: string;
  /** Each guarded field (scripts, engines, packageManager) as text, to see whether it changed. */
  guarded: Map<string, string>;
}

function packageFacts(text: string | null): PackageFacts | undefined {
  // A file that doesn't exist on one side counts as an empty package.json.
  if (text === null) return packageFacts('{}');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const pkg = parsed as Record<string, unknown>;
  const versions = new Map<string, string>();
  for (const field of DEPENDENCY_FIELDS) {
    const list = pkg[field];
    if (!list || typeof list !== 'object') continue;
    for (const [name, spec] of Object.entries(list as Record<string, unknown>)) versions.set(`${field}:${name}`, String(spec));
  }
  const overrides = JSON.stringify(Object.fromEntries(OVERRIDE_FIELDS.map((f) => [f, pkg[f] ?? null])));
  const guarded = new Map<string, string>(GUARDED_FIELDS.map((f) => [f, JSON.stringify(pkg[f] ?? null)]));
  return { versions, overrides, guarded };
}

interface LockEntry {
  name: string;
  resolved: string | undefined;
  installScript: boolean;
}

/** The packages in a package-lock.json (lockfile version 2 or 3), by install path. Undefined when it can't be read. */
function lockPackages(text: string | null): Map<string, LockEntry> | undefined {
  if (text === null) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const packages = parsed && typeof parsed === 'object' ? (parsed as { packages?: unknown }).packages : undefined;
  if (!packages || typeof packages !== 'object' || Array.isArray(packages)) return undefined;
  const out = new Map<string, LockEntry>();
  for (const [path, entry] of Object.entries(packages as Record<string, unknown>)) {
    if (path === '') continue; // the project itself
    const e = entry && typeof entry === 'object' ? (entry as { resolved?: unknown; hasInstallScript?: unknown }) : {};
    const marker = 'node_modules/';
    const at = path.lastIndexOf(marker);
    out.set(path, {
      name: at === -1 ? path : path.slice(at + marker.length),
      resolved: typeof e.resolved === 'string' ? e.resolved : undefined,
      installScript: e.hasInstallScript === true,
    });
  }
  return out;
}

/**
 * Before launch a lockfile change is fine when it only moves existing packages to other versions (every Dependabot
 * minor bump does). It waits when a package name appears that the base lockfile lacks, when a package gains an install
 * script, or when something would be downloaded from outside the npm registry (D-52).
 */
function lockfileHolds(path: string, before: string | null, after: string | null): string[] {
  if ((before === null) !== (after === null)) return [before === null ? `adds ${path}` : `removes ${path}`];
  const old = lockPackages(before);
  const now = lockPackages(after);
  if (!old || !now) return [`couldn't read the packages in ${path}`];
  const oldNames = new Set([...old.values()].map((e) => e.name));
  const reasons: string[] = [];
  for (const [key, entry] of now) {
    const was = old.get(key);
    if (!oldNames.has(entry.name)) reasons.push(`${path} adds the package ${entry.name}`);
    if (entry.installScript && !was?.installScript) reasons.push(`${path}: ${entry.name} gains an install script`);
    // A download address that is new or changed must be the npm registry; unchanged ones were accepted before.
    if (entry.resolved !== undefined && entry.resolved !== was?.resolved && !entry.resolved.startsWith(NPM_REGISTRY)) {
      reasons.push(`${path}: ${entry.name} comes from outside the npm registry`);
    }
  }
  return reasons;
}

/**
 * What in a pull request's package.json changes waits for Christian before launch (D-42): a new dependency (it
 * could be a paid service, and every package is code we run), any version change the bot can't show stays within
 * one major version (TypeScript 7 and @types/node above Node 24 are never accepted, D-01, D-02), any change to
 * overrides, scripts, engines or packageManager, and lockfile changes that add packages (see lockfileHolds). It reads the files themselves, so a pull request's title can't hide an update. A file it can't read
 * waits too.
 */
export function dependencyHolds(files: readonly DependencyFile[]): string[] {
  const reasons: string[] = [];
  for (const { path, before, after } of files) {
    if (before === undefined || after === undefined) {
      reasons.push(`couldn't read ${path}`);
      continue;
    }
    if (path.slice(path.lastIndexOf('/') + 1) === 'package-lock.json') {
      reasons.push(...lockfileHolds(path, before, after));
      continue;
    }
    const old = packageFacts(before);
    const now = packageFacts(after);
    if (!old || !now) {
      reasons.push(`couldn't read the dependencies in ${path}`);
      continue;
    }
    for (const [key, spec] of now.versions) {
      const name = key.slice(key.indexOf(':') + 1);
      const was = old.versions.get(key);
      if (was === undefined) reasons.push(`adds ${name}`);
      else if (was !== spec) {
        const from = majorOf(was);
        if (from === null || from !== majorOf(spec)) reasons.push(`${name} ${was} to ${spec}`);
      }
    }
    if (old.overrides !== now.overrides) reasons.push(`changes the overrides in ${path}`);
    for (const field of GUARDED_FIELDS) {
      if (old.guarded.get(field) !== now.guarded.get(field)) reasons.push(`changes the ${field} in ${path}`);
    }
  }
  return [...new Set(reasons)];
}

/** Every package.json and package-lock.json a pull request touches, counting both sides of a rename (the files to read for dependencyHolds). */
export function dependencyPaths(files: readonly ChangedFile[]): string[] {
  const hits = new Set<string>();
  for (const f of files) {
    for (const path of [f.filename, f.previous_filename]) {
      const name = path ? path.slice(path.lastIndexOf('/') + 1) : '';
      if (path && (name === 'package.json' || name === 'package-lock.json')) hits.add(path);
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
    else if (run.app?.slug !== REQUIRED_CHECK_APP[name]) {
      // All required checks must come from their known GitHub App, not just share a display name.
      problems.push(`"${name}" was not published by its trusted GitHub app`);
    }
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
  /** Every package.json and package-lock.json the pull request touches, read on both sides (see dependencyPaths). */
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
  // A missing base SHA makes it impossible to verify that CI reviewed the current integration state.
  if (!pr.base.sha) problems.push('cannot verify the staging base commit');
  if (pr.mergeable === null) problems.push('GitHub is still checking whether it merges cleanly');
  else if (!pr.mergeable) problems.push("it doesn't merge cleanly into staging");
  if (problems.length > 0) return { action: 'wait', reasons: problems };

  return { action: 'merge', reasons: [`checks passed, Codex is clean, nothing held (${mode} rules)`] };
}
