/**
 * Staging auto-merge (D-39): merges a pull request into `staging` once every required check passed, the Workers
 * preview built, Codex's latest review of the head commit is clean, and nothing sensitive changed. Sensitive pull
 * requests get the "needs-christian" label instead. It never merges into `main`. Rules: scripts/automerge/decide.ts.
 *
 * Run by .github/workflows/staging-automerge.yml. By hand:
 *   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/staging_automerge.ts [--pr <number>] [--dry-run]
 * --dry-run reports what it would do and changes nothing.
 *
 * Exit code: 0 done (merged, labelled or nothing to do), 1 a GitHub call failed, 2 bad arguments or settings.
 */
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { BASE_BRANCH, decide, NEEDS_CHRISTIAN_LABEL, type Decision } from './automerge/decide.ts';
import { createGitHub, GitHubError, type GitHub } from './automerge/github.ts';

export type Done = 'merged' | 'labelled' | 'nothing' | 'would merge' | 'would label' | 'merge refused';

export interface Outcome {
  pr: number;
  decision: Decision;
  done: Done;
}

export async function runAutomerge({
  gh,
  repo,
  pr,
  dryRun,
  log = console.log,
}: {
  gh: GitHub;
  repo: string;
  pr?: number;
  dryRun: boolean;
  log?: (line: string) => void;
}): Promise<Outcome[]> {
  const numbers = pr === undefined ? (await gh.openPulls(BASE_BRANCH)).map((p) => p.number) : [pr];
  const outcomes: Outcome[] = [];

  for (const n of numbers) {
    const pull = await gh.pull(n);
    const relevant = pull.state === 'open' && pull.base.ref === BASE_BRANCH;
    const [files, checks, comments] = relevant
      ? await Promise.all([gh.files(n), gh.checks(pull.head.sha), gh.comments(n)])
      : [[], [], []];
    const decision = decide({ repo, pr: pull, files, checks, comments });

    let done: Done = 'nothing';
    if (decision.action === 'merge') {
      if (dryRun) done = 'would merge';
      else {
        if (pull.base.ref !== BASE_BRANCH) throw new Error(`Refusing to merge #${n} into ${pull.base.ref}.`);
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
    } else if (decision.action === 'label' && !pull.labels.some((l) => l.name === NEEDS_CHRISTIAN_LABEL)) {
      if (dryRun) done = 'would label';
      else {
        if (!(await gh.hasLabel(NEEDS_CHRISTIAN_LABEL))) {
          await gh.createLabel(NEEDS_CHRISTIAN_LABEL, 'Changes a sensitive area: Christian approves and merges it');
        }
        await gh.addLabel(n, NEEDS_CHRISTIAN_LABEL);
        done = 'labelled';
      }
    }

    log(`#${n}: ${decision.action} (${done}) - ${decision.reasons.join('; ')}`);
    outcomes.push({ pr: n, decision, done });
  }
  if (numbers.length === 0) log(`No open pull requests into ${BASE_BRANCH}.`);
  return outcomes;
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
  const pr = values.pr === undefined ? undefined : Number(values.pr);
  if (pr !== undefined && !(Number.isInteger(pr) && pr > 0)) {
    console.error('--pr must be a pull request number.');
    return 2;
  }
  try {
    await runAutomerge({ gh: createGitHub({ token, repo }), repo, pr, dryRun: values['dry-run'] ?? false });
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
