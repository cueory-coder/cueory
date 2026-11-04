/**
 * One viewer startup at a time. A cancelled (unmounted) startup can never
 * publish its result or interfere with a later retry.
 *
 * Kept outside React so rapid activations and asynchronous completions can
 * be tested without a browser or WebGL context.
 */
export function createOpenAttemptGate() {
  let nextTicket = 0;
  let activeTicket: number | null = null;

  return {
    begin(): number | null {
      if (activeTicket !== null) return null;
      activeTicket = ++nextTicket;
      return activeTicket;
    },
    isCurrent(ticket: number): boolean {
      return activeTicket === ticket;
    },
    finish(ticket: number): void {
      if (activeTicket === ticket) activeTicket = null;
    },
    cancel(): void {
      // The next attempt receives a distinct ticket, so a late completion is always stale.
      activeTicket = null;
    },
  };
}
