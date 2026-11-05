/**
 * Staging auto-merge (D-39, D-42): merges a pull request into `staging` once every required check passed, the Workers
 * preview built, Codex's latest review of the head commit is clean, and nothing held changed. Held pull requests get
 * the "needs-christian" label instead. When Codex's own review failed, it asks Codex to try again (at most three
 * times per head commit, Task 39) and waits. It never merges into `main`. Rules: scripts/automerge/decide.ts. Which paths
 * are held depends on automation.json ("prelaunch": true until Christian says the site is live).
 *
 * Run by .github/workflows/staging-automerge.yml. By hand:
 *   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/staging_automerge.ts [--pr <number>] [--dry-run]
 * --dry-run reports what it would do and changes nothing.
 *
 * Exit code: 0 done (merged, labelled or nothing to do), 1 a GitHub call failed, 2 bad arguments or settings.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  BASE_BRANCH,
  codexRetryComment,
  decide,
  dependencyPaths,
  NEEDS_CHRISTIAN_LABEL,
  parseAutomation,
  type ChangedFile,
  type Decision,
  type DependencyFile,
  type Mode,
  type PullRequest,
} from './automerge/decide.ts';
import { createGitHub, GitHubError, TruncatedError, type GitHub } from './automerge/github.ts';
import { selectEventPullRequest } from './automerge/event.ts';

export type Done =
  | 'merged' | 'labelled' | 'nothing' | 'would merge' | 'would label' | 'merge refused'
  | 'codex retry asked' | 'would ask codex retry';

export interface Outcome {
  pr: number;
  decision: Decision;
  done: Done;
}

export async function runAutomerge({
  gh,
  repo,
  mode,
  pr,
  dryRun,
  log = console.log,
}: {
  gh: GitHub;
  repo: string;
  mode: Mode;
  pr?: number;
  dryRun: boolean;
  log?: (line: string) => void;
}): Promise<Outcome[]> {
  log(`Rules: ${mode === 'prelaunch' ? 'pre-launch' : 'launched'} (automation.json)`);
  const numbers = pr === undefined ? (await gh.openPulls(BASE_BRANCH)).map((p) => p.number) : [pr];
  const outcomes: Outcome[] = [];

  for (const n of numbers) {
    const pull = await gh.pull(n);
    const relevant = pull.state === 'open' && pull.base.ref === BASE_BRANCH;
    let decision: Decision;
    try {
      const [files, checks, comments] = relevant
        ? await Promise.all([gh.files(n), gh.checks(pull.head.sha), gh.comments(n)])
        : [[], [], []];
      const dependencies = relevant ? await readDependencies(gh, pull, files) : [];
      decision = decide({ repo, mode, pr: pull, files, dependencies, checks, comments });
    } catch (e) {
      // Fail closed: a list too long to read in full is never judged from part of it.
      if (!(e instanceof TruncatedError)) throw e;
      decision = { action: 'wait', reasons: [`too much to read in full (${e.message})`] };
    }

    let done: Done = 'nothing';
    if (decision.action === 'merge') {
      // A green CI run can belong to an older staging merge-base. Exact-head
      // checks are insufficient unless the PR head already contains staging.
      const ancestry = await gh.compare(BASE_BRANCH, pull.head.sha);
      if (ancestry.behind_by !== 0) {
        done = 'merge refused';
        decision.reasons.push('staging is not an ancestor of this PR head; synchronize and rerun checks');
      } else if (dryRun) done = 'would merge';
      else {
        // Look again right before merging: the merge call goes to whatever base the pull request has now, and only
        // the head commit can be pinned in it. Anything that moved since the checks means: wait for the next event.
        const now = await gh.pull(n);
        if (now.state !== 'open' || now.base.ref !== BASE_BRANCH || now.head.sha !== pull.head.sha) {
          done = 'merge refused';
          decision.reasons.push(`changed while it was being checked (now ${now.state}, into ${now.base.ref})`);
        } else if (!pull.base.sha || now.base.sha !== pull.base.sha) {
          // A clean PR head is not enough if staging moved after the merge-test checks were gathered.
          done = 'merge refused';
          decision.reasons.push('staging changed while checks were being evaluated; retry with fresh checks');
        } else if (now.labels.some((l) => l.name === NEEDS_CHRISTIAN_LABEL)) {
          // Someone stopped the bot while it was checking.
          done = 'merge refused';
          decision.reasons.push(`labelled ${NEEDS_CHRISTIAN_LABEL} while it was being checked`);
        } else {
          try {
            await gh.merge(n, pull.head.sha);
            done = 'merged';
          } catch (e) {
            // 405: not mergeable after all; 409: a new commit arrived since the checks. Both wait for the next event.
            if (e instanceof GitHubError && (e.status === 405 || e.status === 409)) {
              done = 'merge refused';
              decision.reasons.push(e.message);
            } else throw e;
          }
        }
      }
    } else if (decision.action === 'label' && !pull.labels.some((l) => l.name === NEEDS_CHRISTIAN_LABEL)) {
      if (dryRun) done = 'would label';
      else {
        if (!(await gh.hasLabel(NEEDS_CHRISTIAN_LABEL))) {
          await gh.createLabel(NEEDS_CHRISTIAN_LABEL, 'Waits for Christian: he approves and merges it');
        }
        await gh.addLabel(n, NEEDS_CHRISTIAN_LABEL);
        done = 'labelled';
      }
    } else if (decision.action === 'wait' && decision.codexRetry) {
      // Codex failed for its own reasons: ask it once more (bounded per head commit), and keep waiting.
      if (dryRun) done = 'would ask codex retry';
      else {
        // "@codex review" applies to whatever head the pull request has when it is posted, so look again first.
        const now = await gh.pull(n);
        if (now.state !== 'open' || now.head.sha !== decision.codexRetry.headSha) {
          decision.reasons.push('new commit arrived; no retry asked for the old head');
        } else if (now.labels.some((l) => l.name === NEEDS_CHRISTIAN_LABEL)) {
          decision.reasons.push(`labelled ${NEEDS_CHRISTIAN_LABEL} while it was being checked; no retry asked`);
        } else {
          await gh.createComment(n, codexRetryComment(decision.codexRetry.headSha));
          done = 'codex retry asked';
        }
      }
    }

    log(`#${n}: ${decision.action} (${done}) - ${decision.reasons.join('; ')}`);
    outcomes.push({ pr: n, decision, done });
  }
  if (numbers.length === 0) log(`No open pull requests into ${BASE_BRANCH}.`);
  return outcomes;
}

/**
 * Every package.json and package-lock.json the pull request touches, as it is now on the base branch and in the pull request's head
 * commit, so decide() can compare the dependency lists themselves.
 */
async function readDependencies(gh: GitHub, pull: PullRequest, files: readonly ChangedFile[]): Promise<DependencyFile[]> {
  return Promise.all(
    dependencyPaths(files).map(async (path) => {
      const [before, after] = await Promise.all([gh.fileAt(path, pull.base.sha ?? pull.base.ref), gh.fileAt(path, pull.head.sha)]);
      return { path, before, after };
    }),
  );
}

async function main(): Promise<number> {
  let values: { pr?: string; 'dry-run'?: boolean };
  try {
    ({ values } = parseArgs({ options: { pr: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } }));
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error('Set GITHUB_TOKEN and GITHUB_REPOSITORY (owner/name).');
    return 2;
  }
  const manualPr = values.pr === undefined ? undefined : Number(values.pr);
  if (manualPr !== undefined && !(Number.isInteger(manualPr) && manualPr > 0)) {
    console.error('--pr must be a pull request number.');
    return 2;
  }
  // The default branch's copy, checked out next to this script. Missing or unreadable means the stricter rules.
  let text: string | undefined;
  try {
    text = readFileSync(new URL('../automation.json', import.meta.url), 'utf8');
  } catch {
    text = undefined;
  }
  const { mode, note } = parseAutomation(text);
  if (note) console.log(note);

  // GitHub Actions calls this script for CI, Cloudflare previews and Codex reviews.
  // Those events should inspect only their associated PR, not every open PR.
  let eventPayload: unknown;
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (manualPr === undefined && eventName && eventName !== 'schedule' && eventName !== 'workflow_dispatch') {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) {
      console.error('GitHub event payload is missing; refusing an unscoped merge scan.');
      return 1;
    }
    try {
      eventPayload = JSON.parse(readFileSync(eventPath, 'utf8'));
    } catch {
      console.error('GitHub event payload could not be read; refusing an unscoped merge scan.');
      return 1;
    }
  }
  const selection = selectEventPullRequest(eventName, eventPayload, manualPr);
  if (selection.kind === 'none') {
    console.log('Event has no unambiguous pull request; the hourly sweep will reconcile it.');
    return 0;
  }
  const pr = selection.kind === 'one' ? selection.pr : undefined;
  try {
    await runAutomerge({ gh: createGitHub({ token, repo }), repo, mode, pr, dryRun: values['dry-run'] ?? false });
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
