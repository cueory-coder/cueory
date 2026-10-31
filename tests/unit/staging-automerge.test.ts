import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkProblems,
  codexProblems,
  codexState,
  decide,
  isSensitivePath,
  REQUIRED_CHECKS,
  sensitivePaths,
  type CheckRun,
  type IssueComment,
  type PullRequest,
} from '../../scripts/automerge/decide.ts';
import { createGitHub, type Fetch } from '../../scripts/automerge/github.ts';
import { runAutomerge } from '../../scripts/staging_automerge.ts';

const REPO = 'owner/site';
const HEAD = 'a1b2c3d4';

function pull(over: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 7,
    state: 'open',
    draft: false,
    mergeable: true,
    base: { ref: 'staging' },
    head: { sha: HEAD, ref: 'task-4/thing', repo: { full_name: REPO } },
    labels: [],
    ...over,
  };
}

let nextId = 1;
const run = (name: string, conclusion: string | null = 'success', status = 'completed'): CheckRun => ({
  id: nextId++,
  name,
  status,
  conclusion,
});
const greenChecks = () => [...REQUIRED_CHECKS.map((n) => run(n)), run('Analyze (actions)', 'skipped')];

function codexComment(state: object, over: Partial<IssueComment> = {}): IssueComment {
  return {
    id: nextId++,
    updated_at: '2026-10-31T17:00:00Z',
    user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
    body: `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify(state)} -->\n\n## Codex Review Summary`,
    ...over,
  };
}
const clean = (sha = HEAD) => ({
  code_review: { commit_sha: sha, has_any_findings: false, has_unresolved_findings: false, status: 'completed' },
  security_review: { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null },
});

const input = (over: Partial<Parameters<typeof decide>[0]> = {}) => ({
  repo: REPO,
  pr: pull(),
  files: [{ filename: 'src/islands/cards.ts' }, { filename: 'docs/STATUS.md' }],
  checks: greenChecks(),
  comments: [codexComment(clean())],
  ...over,
});

describe('sensitive paths', () => {
  it.each([
    '.github/workflows/ci.yml',
    'supabase/migrations/001.sql',
    'public/_headers',
    'astro.config.mjs',
    'wrangler.jsonc',
    'SECURITY.md',
    'CLAUDE.md',
    'AGENTS.md',
    'brand-source/cueory-geometry-master-v1.0.json',
    'public/brand/cueory-square-dark.svg',
    'package.json',
    'package-lock.json',
    'scripts/automerge/decide.ts',
    'scripts/staging_automerge.ts',
    '.node-version',
    'src/config/site.ts',
    'tools/extra/package.json',
  ])('%s needs Christian', (path) => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it.each(['src/islands/cards.ts', 'docs/STATUS.md', 'content/cards/study-skills-01.json', 'tests/unit/x.test.ts', 'public/favicon.svg'])(
    '%s does not',
    (path) => {
      expect(isSensitivePath(path)).toBe(false);
    },
  );

  it('counts both sides of a rename', () => {
    expect(sensitivePaths([{ filename: 'docs/old-headers.txt', previous_filename: 'public/_headers' }])).toEqual([
      'public/_headers',
    ]);
  });
});

describe('checks', () => {
  it('passes when every required check succeeded and the rest are fine', () => {
    expect(checkProblems(greenChecks())).toEqual([]);
  });

  it('waits for a required check that is missing or still running', () => {
    const checks = greenChecks().filter((c) => c.name !== 'Workers Builds: cueory');
    expect(checkProblems(checks)).toEqual(['"Workers Builds: cueory" hasn\'t reported yet']);
    expect(checkProblems([...checks, run('Workers Builds: cueory', null, 'in_progress')])).toEqual([
      '"Workers Builds: cueory" is still running',
    ]);
  });

  it('blocks on a failed required check and on any other failed check', () => {
    expect(checkProblems([...greenChecks(), run('Type check, build and test', 'failure')])).toEqual([
      '"Type check, build and test" ended as failure',
    ]);
    expect(checkProblems([...greenChecks(), run('Something else', 'cancelled')])).toEqual([
      '"Something else" ended as cancelled',
    ]);
  });

  it('uses the newest run when a check was re-run', () => {
    const failedThenPassed = [...greenChecks(), run('Workers Builds: cueory', 'failure'), run('Workers Builds: cueory')];
    expect(checkProblems(failedThenPassed)).toEqual([]);
  });
});

describe("Codex's review", () => {
  it('reads the newest summary that Codex itself posted', () => {
    const old = codexComment(clean('old'), { updated_at: '2026-10-31T16:00:00Z' });
    const fake = codexComment(clean(), { updated_at: '2026-10-31T18:00:00Z', user: { login: 'someone', type: 'User' } });
    const newest = codexComment(clean(), { updated_at: '2026-10-31T17:00:00Z' });
    expect(codexState([old, fake, newest])?.code_review?.commit_sha).toBe(HEAD);
    expect(codexState([old, fake])?.code_review?.commit_sha).toBe('old');
    expect(codexState([fake])).toBeNull();
  });

  it('ignores a summary it cannot read', () => {
    expect(codexState([codexComment({}, { body: '<!-- codex-review-state:v1 {not json} -->' })])).toBeNull();
  });

  it('is clean only for a finished review of this exact commit with no findings', () => {
    expect(codexProblems(clean(), HEAD)).toEqual([]);
    expect(codexProblems(null, HEAD)).toEqual(["Codex hasn't posted a review summary yet"]);
    expect(codexProblems(clean('older'), HEAD)).toEqual(["Codex hasn't reviewed the latest commit yet"]);
    const running = { code_review: { ...clean().code_review, status: 'running', has_any_findings: null } };
    expect(codexProblems(running, HEAD)).toEqual(['Codex is still reviewing']);
    const findings = { code_review: { ...clean().code_review, has_any_findings: true, has_unresolved_findings: true } };
    expect(codexProblems(findings, HEAD)).toEqual(['Codex found something to look at', 'Codex has unresolved findings']);
    const security = {
      ...clean(),
      security_review: { commit_sha: HEAD, has_any_findings: true, has_unresolved_findings: true, status: 'completed' },
    };
    expect(codexProblems(security, HEAD)).toEqual(['Codex security review is open']);
  });
});

describe('decide', () => {
  it('merges a clean, non-sensitive pull request into staging', () => {
    expect(decide(input()).action).toBe('merge');
  });

  it('never merges into main or any branch other than staging', () => {
    expect(decide(input({ pr: pull({ base: { ref: 'main' } }) }))).toEqual({
      action: 'skip',
      reasons: ['targets main, not staging'],
    });
  });

  it('skips closed, draft and fork pull requests', () => {
    expect(decide(input({ pr: pull({ state: 'closed' }) })).action).toBe('skip');
    expect(decide(input({ pr: pull({ draft: true }) })).action).toBe('skip');
    expect(decide(input({ pr: pull({ head: { sha: HEAD, ref: 'x', repo: { full_name: 'fork/site' } } }) })).action).toBe(
      'skip',
    );
    expect(decide(input({ pr: pull({ head: { sha: HEAD, ref: 'x', repo: null } }) })).action).toBe('skip');
  });

  it('labels a sensitive pull request for Christian even when everything else is clean', () => {
    const decision = decide(input({ files: [{ filename: 'src/x.ts' }, { filename: '.github/workflows/ci.yml' }] }));
    expect(decision).toEqual({ action: 'label', reasons: ['needs Christian: changes .github/workflows/ci.yml'] });
  });

  it('labels a pull request too big for GitHub to list in full', () => {
    const files = Array.from({ length: 3000 }, (_, i) => ({ filename: `content/f${i}.json` }));
    expect(decide(input({ files })).action).toBe('label');
  });

  it('waits for checks, Codex and a clean merge', () => {
    expect(decide(input({ checks: [] })).action).toBe('wait');
    expect(decide(input({ comments: [] })).action).toBe('wait');
    expect(decide(input({ pr: pull({ mergeable: null }) })).reasons).toEqual([
      'GitHub is still checking whether it merges cleanly',
    ]);
    expect(decide(input({ pr: pull({ mergeable: false }) })).reasons).toEqual([
      "it doesn't merge cleanly into staging",
    ]);
  });
});

/** A pretend GitHub that records every call, so nothing touches the network. */
function fakeGitHub(
  pulls: Record<number, { pr: PullRequest; files: string[] }>,
  {
    labelExists = false,
    /** Every comment page comes back full, as if there were endless comments. */
    endlessComments = false,
    /** What GET /pulls/N returns from its second call on (someone changed the pull request mid-run). */
    later = undefined as Partial<PullRequest> | undefined,
  } = {},
) {
  const seen = new Map<number, number>();
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  const fetch: Fetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    const path = url.replace(`https://api.github.com/repos/${REPO}`, '').replace(/[?&]per_page=\d+&page=\d+$/, '');
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const pr = (n: string) => pulls[Number(n)];
    let m: RegExpMatchArray | null;
    if (method === 'GET' && path === '/pulls?state=open&base=staging') return json(Object.values(pulls).map((p) => ({ number: p.pr.number })));
    if (method === 'GET' && (m = path.match(/^\/pulls\/(\d+)$/))) {
      const n = Number(m[1]);
      seen.set(n, (seen.get(n) ?? 0) + 1);
      return json(seen.get(n)! > 1 && later ? { ...pr(m[1]!)!.pr, ...later } : pr(m[1]!)!.pr);
    }
    if (method === 'GET' && (m = path.match(/^\/pulls\/(\d+)\/files$/))) return json(pr(m[1]!)!.files.map((filename) => ({ filename })));
    if (method === 'GET' && path.startsWith('/commits/')) return json({ total_count: 5, check_runs: greenChecks() });
    if (method === 'GET' && path.match(/^\/issues\/\d+\/comments$/)) {
      return json(endlessComments ? Array.from({ length: 100 }, () => codexComment(clean())) : [codexComment(clean())]);
    }
    if (method === 'GET' && path.startsWith('/labels/')) return labelExists ? json({ name: 'needs-christian' }) : json({ message: 'Not Found' }, 404);
    if (method === 'PUT' && path.match(/^\/pulls\/\d+\/merge$/)) return json({ merged: true });
    if (method === 'POST') return json({}, 201);
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };
  return { gh: createGitHub({ token: 'test-token', repo: REPO, fetch }), calls };
}

describe('the auto-merge run', () => {
  const pulls = () => ({
    7: { pr: pull(), files: ['src/islands/cards.ts'] },
    8: { pr: pull({ number: 8 }), files: ['public/_headers'] },
  });

  it('in a dry run, reports what it would do and changes nothing', async () => {
    const { gh, calls } = fakeGitHub(pulls());
    const lines: string[] = [];
    const outcomes = await runAutomerge({ gh, repo: REPO, dryRun: true, log: (l) => lines.push(l) });
    expect(outcomes.map((o) => [o.pr, o.done])).toEqual([
      [7, 'would merge'],
      [8, 'would label'],
    ]);
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(lines[1]).toContain('needs Christian: changes public/_headers');
  });

  it('merges with a merge commit pinned to the checked head, and labels the sensitive one', async () => {
    const { gh, calls } = fakeGitHub(pulls());
    await runAutomerge({ gh, repo: REPO, dryRun: false, log: () => {} });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([
      { method: 'PUT', path: '/pulls/7/merge', body: { merge_method: 'merge', sha: HEAD } },
      { method: 'POST', path: '/labels', body: expect.objectContaining({ name: 'needs-christian' }) },
      { method: 'POST', path: '/issues/8/labels', body: { labels: ['needs-christian'] } },
    ]);
  });

  it("doesn't label twice or create a label that exists", async () => {
    const already = { 8: { pr: pull({ number: 8, labels: [{ name: 'needs-christian' }] }), files: ['CLAUDE.md'] } };
    const first = fakeGitHub(already);
    await runAutomerge({ gh: first.gh, repo: REPO, dryRun: false, log: () => {} });
    expect(first.calls.filter((c) => c.method !== 'GET')).toEqual([]);

    const second = fakeGitHub({ 8: { pr: pull({ number: 8 }), files: ['CLAUDE.md'] } }, { labelExists: true });
    await runAutomerge({ gh: second.gh, repo: REPO, dryRun: false, log: () => {} });
    expect(second.calls.filter((c) => c.method !== 'GET').map((c) => c.path)).toEqual(['/issues/8/labels']);
  });

  it('never merges a pull request into main, even when asked for it by number', async () => {
    const { gh, calls } = fakeGitHub({ 9: { pr: pull({ number: 9, base: { ref: 'main' } }), files: ['src/x.ts'] } });
    const outcomes = await runAutomerge({ gh, repo: REPO, pr: 9, dryRun: false, log: () => {} });
    expect(outcomes[0]!.decision.action).toBe('skip');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('waits instead of judging from part of a list that is too long to read in full', async () => {
    const { gh, calls } = fakeGitHub({ 7: { pr: pull(), files: ['src/x.ts'] } }, { endlessComments: true });
    const outcomes = await runAutomerge({ gh, repo: REPO, dryRun: false, log: () => {} });
    expect(outcomes[0]!.decision.action).toBe('wait');
    expect(outcomes[0]!.decision.reasons[0]).toContain('too much to read in full');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('looks again right before merging and stops if the pull request now targets main', async () => {
    const { gh, calls } = fakeGitHub({ 7: { pr: pull(), files: ['src/x.ts'] } }, { later: { base: { ref: 'main' } } });
    const outcomes = await runAutomerge({ gh, repo: REPO, dryRun: false, log: () => {} });
    expect(outcomes[0]!.done).toBe('merge refused');
    expect(outcomes[0]!.decision.reasons.at(-1)).toContain('into main');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('stops if a new commit arrived between the checks and the merge', async () => {
    const { gh, calls } = fakeGitHub({ 7: { pr: pull(), files: ['src/x.ts'] } }, { later: { head: { sha: 'ffff', ref: 'x', repo: { full_name: REPO } } } });
    expect((await runAutomerge({ gh, repo: REPO, dryRun: false, log: () => {} }))[0]!.done).toBe('merge refused');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('stops with exit code 2 when the token or repository is missing', () => {
    let status = 0;
    try {
      execFileSync(process.execPath, ['scripts/staging_automerge.ts', '--dry-run'], {
        env: { PATH: process.env.PATH },
        stdio: 'pipe',
      });
    } catch (e) {
      status = (e as { status: number }).status;
    }
    expect(status).toBe(2);
  });
});

describe('the workflow file', () => {
  const yml = readFileSync(new URL('../../.github/workflows/staging-automerge.yml', import.meta.url), 'utf8');

  it("always runs the default branch's copy of the rules", () => {
    expect(yml).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(yml).toContain("github.event_name == 'workflow_dispatch' && github.ref_name == github.event.repository.default_branch");
    expect(yml).toContain('persist-credentials: false');
  });

  it('starts with no permissions and gives the job only what merging and labelling need', () => {
    expect(yml).toMatch(/^permissions: \{\}$/m);
    const job = yml.slice(yml.indexOf('    permissions:'), yml.indexOf('    steps:'));
    expect(job.match(/^ {6}[a-z-]+:/gm)).toEqual([
      '      contents:',
      '      pull-requests:',
      '      issues:',
      '      checks:',
    ]);
  });

  it('pins every action to a full commit SHA and never puts event text inside a shell command', () => {
    for (const use of yml.match(/uses: \S+/g) ?? []) expect(use).toMatch(/@[0-9a-f]{40}$/);
    const run = yml.slice(yml.indexOf('        run: |'));
    expect(run).not.toContain('${{');
  });

  it('dry-runs manual runs unless unticked', () => {
    expect(yml).toMatch(/dry_run:[\s\S]*?default: true/);
  });
});
