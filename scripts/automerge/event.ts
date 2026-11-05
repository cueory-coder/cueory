/**
 * Select the one pull request responsible for a GitHub Actions event.
 *
 * CI/preview/review events must never turn into expensive repository-wide PR scans.
 * Only the hourly schedule, an explicit manual sweep, or a local CLI invocation may scan all.
 * Ambiguous/missing PR associations fail closed and wait for the hourly reconciliation.
 */
export type EventSelection =
  | { kind: 'one'; pr: number }
  | { kind: 'sweep' }
  | { kind: 'none' };

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const prNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;

function associatedPr(event: Record<string, unknown>, key: 'check_run' | 'workflow_run'): number | undefined {
  const related = object(event[key])?.pull_requests;
  // If a single check belongs to several PRs, an hourly sweep handles all of them.
  // Choosing the first would silently neglect the others.
  if (!Array.isArray(related) || related.length !== 1) return undefined;
  return prNumber(object(related[0])?.number);
}

export function selectEventPullRequest(
  eventName: string | undefined,
  payload: unknown,
  manualPr?: number,
): EventSelection {
  if (manualPr !== undefined) return { kind: 'one', pr: manualPr };
  if (!eventName || eventName === 'schedule' || eventName === 'workflow_dispatch') return { kind: 'sweep' };

  const event = object(payload);
  if (!event) return { kind: 'none' };

  if (eventName === 'issue_comment') {
    const issue = object(event.issue);
    const number = prNumber(issue?.number);
    return issue?.pull_request && number !== undefined ? { kind: 'one', pr: number } : { kind: 'none' };
  }

  if (eventName === 'check_run' || eventName === 'workflow_run') {
    const number = associatedPr(event, eventName);
    return number !== undefined ? { kind: 'one', pr: number } : { kind: 'none' };
  }

  // A newly introduced workflow trigger must opt into this routing deliberately.
  return { kind: 'none' };
}
