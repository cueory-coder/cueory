import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_NETWORK_NOTICE, NETWORK_COPY, NETWORK_SETTLE_MS, nextNetworkNoticeState } from '../../src/scripts/networknotice';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/** Simulates browser connection events with a controlled clock. */
describe('network notice — debounced transitions', () => {
  it('starts silent and online, then shows one notice after a stable outage', () => {
    let state = nextNetworkNoticeState(INITIAL_NETWORK_NOTICE, 'offline', Date.now());
    expect(state.offline).toBe(false);
    expect(state.pending?.offline).toBe(true);
    vi.advanceTimersByTime(NETWORK_SETTLE_MS - 1);
    state = nextNetworkNoticeState(state, 'settle', Date.now());
    expect(state.offline).toBe(false);
    vi.advanceTimersByTime(1);
    state = nextNetworkNoticeState(state, 'settle', Date.now());
    expect(state).toEqual({ offline: true, pending: null });
    expect(nextNetworkNoticeState(state, 'offline', Date.now())).toBe(state);
  });

  it('ignores an outage that comes back before the debounce ends', () => {
    const pending = nextNetworkNoticeState(INITIAL_NETWORK_NOTICE, 'offline', Date.now());
    vi.advanceTimersByTime(NETWORK_SETTLE_MS - 1);
    const recovered = nextNetworkNoticeState(pending, 'online', Date.now());
    expect(recovered).toEqual({ offline: false, pending: null });
    vi.advanceTimersByTime(NETWORK_SETTLE_MS);
    expect(nextNetworkNoticeState(recovered, 'settle', Date.now()).offline).toBe(false);
  });

  it('hides only after a stable online event and does not spam when signals flap', () => {
    let state = nextNetworkNoticeState(INITIAL_NETWORK_NOTICE, 'offline', Date.now());
    vi.advanceTimersByTime(NETWORK_SETTLE_MS);
    state = nextNetworkNoticeState(state, 'settle', Date.now());
    const offline = state;
    state = nextNetworkNoticeState(state, 'online', Date.now());
    vi.advanceTimersByTime(NETWORK_SETTLE_MS - 1);
    state = nextNetworkNoticeState(state, 'offline', Date.now());
    expect(state).toEqual(offline);
    vi.advanceTimersByTime(NETWORK_SETTLE_MS);
    state = nextNetworkNoticeState(state, 'settle', Date.now());
    expect(state).toEqual(offline);
    state = nextNetworkNoticeState(state, 'online', Date.now());
    vi.advanceTimersByTime(NETWORK_SETTLE_MS);
    expect(nextNetworkNoticeState(state, 'settle', Date.now())).toEqual({ offline: false, pending: null });
  });

  it('does not restart the debounce for identical events or mutate the input', () => {
    const initial = INITIAL_NETWORK_NOTICE;
    const first = nextNetworkNoticeState(initial, 'offline', Date.now());
    vi.advanceTimersByTime(100);
    expect(nextNetworkNoticeState(first, 'offline', Date.now())).toBe(first);
    expect(initial).toEqual({ offline: false, pending: null });
    expect(first.pending?.since).toBe(Date.now() - 100);
  });

  it('does not settle a backwards clock or repeat a stable outage transition', () => {
    const start = Date.now();
    const pending = nextNetworkNoticeState(INITIAL_NETWORK_NOTICE, 'offline', start);
    expect(nextNetworkNoticeState(pending, 'settle', start - 100)).toBe(pending);
    const offline = nextNetworkNoticeState(pending, 'settle', start + NETWORK_SETTLE_MS);
    expect(offline).toEqual({ offline: true, pending: null });
    expect(nextNetworkNoticeState(offline, 'settle', start + 2 * NETWORK_SETTLE_MS)).toBe(offline);
    expect(nextNetworkNoticeState(offline, 'offline', start + 2 * NETWORK_SETTLE_MS)).toBe(offline);
  });

  it('keeps announcement text short, cautious, and separate from the page', () => {
    expect(NETWORK_COPY.title).toContain('offline');
    expect(NETWORK_COPY.description).toContain('saved lessons');
    expect(NETWORK_COPY.description).toContain('games already loaded');
    expect(NETWORK_COPY.announcement).not.toContain('always');
    expect(nextNetworkNoticeState(INITIAL_NETWORK_NOTICE, 'offline', NaN)).toBe(INITIAL_NETWORK_NOTICE);
  });
});
