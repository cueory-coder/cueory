import { describe, expect, it } from 'vitest';
import { createGitHub, type Fetch } from '../../scripts/automerge/github.ts';
import { runAutomerge } from '../../scripts/staging_automerge.ts';
import { selectEventPullRequest } from '../../scripts/automerge/event.ts';

describe('selecting a PR for staging auto-merge', () => {
  it('checks only the PR from a Codex issue comment', () => {
    expect(selectEventPullRequest('issue_comment', { issue: { number: 593, pull_request: { url: 'https://example.invalid/pr' } } }))
      .toEqual({ kind: 'one', pr: 593 });
    expect(selectEventPullRequest('issue_comment', { issue: { number: 593 } })).toEqual({ kind: 'none' });
    expect(selectEventPullRequest('issue_comment', { issue: { number: -1, pull_request: {} } })).toEqual({ kind: 'none' });
  });

  it('checks only the associated PR for a successful CI workflow event', () => {
    expect(selectEventPullRequest('workflow_run', { workflow_run: { pull_requests: [{ number: 18 }] } }))
      .toEqual({ kind: 'one', pr: 18 });
    expect(selectEventPullRequest('workflow_run', { workflow_run: { pull_requests: [] } }))
      .toEqual({ kind: 'none' });
  });

  it('checks the associated PR for a Workers preview check event', () => {
    expect(selectEventPullRequest('check_run', { check_run: { pull_requests: [{ number: 29 }] } }))
      .toEqual({ kind: 'one', pr: 29 });
    expect(selectEventPullRequest('check_run', { check_run: { pull_requests: [{ number: 29 }, { number: 30 }] } }))
      .toEqual({ kind: 'none' });
    expect(selectEventPullRequest('check_run', { check_run: { pull_requests: [{ number: 0 }] } }))
      .toEqual({ kind: 'none' });
  });

  it('never scans all PRs on unknown, malformed or unassociated event payloads', () => {
    expect(selectEventPullRequest('check_run', undefined)).toEqual({ kind: 'none' });
    expect(selectEventPullRequest('workflow_run', { workflow_run: { pull_requests: 'wrong shape' } }))
      .toEqual({ kind: 'none' });
    expect(selectEventPullRequest('push', { ref: 'refs/heads/main' })).toEqual({ kind: 'none' });
  });

  it('reserves full reconciliation for hourly, manual and non-Actions CLI runs', () => {
    expect(selectEventPullRequest('schedule', {})).toEqual({ kind: 'sweep' });
    expect(selectEventPullRequest('workflow_dispatch', {})).toEqual({ kind: 'sweep' });
    expect(selectEventPullRequest(undefined, undefined)).toEqual({ kind: 'sweep' });
    expect(selectEventPullRequest('workflow_dispatch', {}, 123)).toEqual({ kind: 'one', pr: 123 });
    expect(selectEventPullRequest('check_run', { check_run: { pull_requests: [] } }, 123))
      .toEqual({ kind: 'one', pr: 123 });
  });
});

describe('API rate-limit failures', () => {
  it.each([403, 429])('fails closed on a GitHub %i for targeted and hourly checks', async (status) => {
    for (const pr of [42, undefined]) {
      const calls: Array<{ method: string; path: string }> = [];
      const fetch: Fetch = async (url, init) => {
        calls.push({ method: init?.method ?? 'GET', path: new URL(url).pathname });
        return new Response(JSON.stringify({ message: 'API rate limit exceeded for installation' }), { status });
      };
      const gh = createGitHub({ token: 'synthetic-test-token', repo: 'owner/site', fetch });
      await expect(runAutomerge({
        gh,
        repo: 'owner/site',
        mode: 'prelaunch',
        pr,
        dryRun: false,
        log: () => {},
      })).rejects.toMatchObject({ status });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe('GET');
      expect(calls[0]?.path).toContain(pr === undefined ? '/pulls?'.split('?')[0] : '/pulls/42');
      expect(calls.every((call) => call.method === 'GET')).toBe(true);
    }
  });
});
