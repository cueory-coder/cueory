import { describe, expect, it } from 'vitest';
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
