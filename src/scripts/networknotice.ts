/**
 * Offline notice decision and its small browser adapter (Task 761).
 * The state machine is pure: it receives event names and a monotonic clock.
 * A short debounce ignores fleeting network flips, so live text changes only
 * once per genuine outage. navigator.onLine is a hint, not a connectivity probe.
 */
export const NETWORK_SETTLE_MS = 600;
export const NETWORK_COPY = {
  title: "you're offline.",
  description: 'saved lessons and games already loaded may still work. new content may need a connection.',
  announcement: "you're offline. saved lessons and games already loaded may still work.",
} as const;

export interface NetworkNoticeState {
  readonly offline: boolean;
  readonly pending: { readonly offline: boolean; readonly since: number } | null;
}

export type NetworkNoticeEvent = 'online' | 'offline' | 'settle';
export const INITIAL_NETWORK_NOTICE: NetworkNoticeState = { offline: false, pending: null };

/** Each input returns a new state, never modifies its argument. */
export function nextNetworkNoticeState(
  state: NetworkNoticeState,
  event: NetworkNoticeEvent,
  now: number,
  delayMs = NETWORK_SETTLE_MS,
): NetworkNoticeState {
  if (!Number.isFinite(now)) return state;
  if (event === 'settle') {
    if (!state.pending || now - state.pending.since < Math.max(0, delayMs)) return state;
    return { offline: state.pending.offline, pending: null };
  }

  const wanted = event === 'offline';
  if (wanted === state.offline) {
    // The connection returned to the stable state before the debounce ended.
    return state.pending ? { offline: state.offline, pending: null } : state;
  }
  if (state.pending?.offline === wanted) return state;
  return { offline: state.offline, pending: { offline: wanted, since: now } };
}

/** One event listener set per page, regardless of how many notices are rendered. */
export function startNetworkNotice(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') return;
  const panel = document.querySelector<HTMLElement>('[data-network-notice-panel]');
  const live = document.querySelector<HTMLElement>('[data-network-notice-live]');
  if (!panel || !live) return;

  let state: NetworkNoticeState = { ...INITIAL_NETWORK_NOTICE };
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  function apply(next: NetworkNoticeState): void {
    const wasOffline = state.offline;
    state = next;
    if (state.offline === wasOffline) return;
    panel!.hidden = !state.offline;
    live!.textContent = state.offline ? NETWORK_COPY.announcement : '';
  }

  function schedule(): void {
    if (pendingTimer !== undefined) clearTimeout(pendingTimer);
    pendingTimer = undefined;
    if (!state.pending) return;
    const remaining = Math.max(0, NETWORK_SETTLE_MS - (performance.now() - state.pending.since));
    pendingTimer = window.setTimeout(() => {
      pendingTimer = undefined;
      apply(nextNetworkNoticeState(state, 'settle', performance.now()));
      if (state.pending) schedule();
    }, remaining);
  }

  function signal(online: boolean): void {
    apply(nextNetworkNoticeState(state, online ? 'online' : 'offline', performance.now()));
    schedule();
  }

  window.addEventListener('offline', () => signal(false));
  window.addEventListener('online', () => signal(true));
  window.addEventListener('pageshow', () => signal(navigator.onLine));
  if (!navigator.onLine) signal(false);
}

if (typeof document !== 'undefined') startNetworkNotice();
