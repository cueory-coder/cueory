/**
 * In-memory, first-party study-event recorder (Task 146).
 *
 * This module does not read accounts, browser storage, question content, or the
 * network. A signed-in real-question player may supply an RPC sender in Task 147.
 * Never call it for sample material. Events contain only published UUIDs, an
 * action, visible time, and a fixed UTC time. The server remains authoritative.
 */

export const STUDY_EVENT_BATCH_SIZE = 50;
export const STUDY_EVENT_MAX_MS = 1_800_000;
export const STUDY_EVENT_MAX_PENDING = 1_000;
export const STUDY_EVENT_RATE_LIMIT_MS = 15 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_RETRY_MS = 60_000;
const BASE_RETRY_MS = 1_000;
const MAX_CLOCK_LEAD_MS = 5 * 60_000;

export type StudyEventKind = 'answered' | 'marked' | 'skipped';
export type StudyEventMark = 'know' | 'learning';

type EventBase = {
  item_id: string;
  version_id: string;
  ms_on_item: number;
  at: string;
};

export type RecordedStudyEvent = Readonly<EventBase & (
  | { kind: 'marked'; mark: StudyEventMark }
  | { kind: 'answered' | 'skipped'; mark?: never }
)>;

/**
 * Sender must raise an Error (or PostgREST error) on failure, and return the
 * integer RPC result on success. A result of zero is valid for an already-
 * recorded retry. The optional signal lets the adapter cancel on sign-out.
 */
export type StudyEventSender = (
  events: readonly RecordedStudyEvent[], signal: AbortSignal,
) => Promise<number>;

export interface StudyEventQueueOptions {
  send: StudyEventSender;
  /** UTC clock for event timestamps and retry delays; injectable for tests. */
  now?: () => number;
  /** Monotonic clock for visible time on the current item. */
  elapsedNow?: () => number;
  /** False when a tab starts in the background. Caller reports later changes. */
  initiallyVisible?: boolean;
}

export type StudyEventFlushStatus = 'complete' | 'idle' | 'retry' | 'dropped' | 'signed-out';
export interface StudyEventFlushResult {
  status: StudyEventFlushStatus;
  /** Events accepted for processing, including server-deduplicated retries. */
  delivered: number;
  /** Events discarded after a definitive server refusal. */
  dropped: number;
  pending: number;
  nextRetryAt: number | null;
}

export interface StudyEventQueue {
  /** Start visible-time measurement when a real, published question appears. */
  beginItem(itemId: string, versionId: string): boolean;
  /** Stop timing when the player closes or navigates away. */
  endItem(): void;
  /** The caller must pass document.visibilityState changes here. */
  setVisible(visible: boolean): void;
  /** Record an action without any answer, content, correctness, or student ID. */
  record(kind: 'marked', mark: StudyEventMark): RecordedStudyEvent | null;
  record(kind: 'answered' | 'skipped'): RecordedStudyEvent | null;
  /** Flush FIFO batches of at most 50, or report when retry is allowed. */
  flush(): Promise<StudyEventFlushResult>;
  /** Drop all local events and disable this queue for the signed-out session. */
  signOut(): void;
  /** In-memory state for the eventual adapter's retry scheduler. */
  state(): { pending: number; nextRetryAt: number | null; signedOut: boolean };
}

interface ActiveItem {
  itemId: string;
  versionId: string;
  accumulatedMs: number;
  visibleSince: number | null;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error !== null && typeof error === 'object' && 'message' in error &&
      typeof error.message === 'string') return error.message;
  return '';
}

function finiteClock(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

/** No timer or network access happens until the caller starts an item or flushes. */
export function createStudyEventQueue(options: StudyEventQueueOptions): StudyEventQueue {
  const now = options.now ?? Date.now;
  const elapsedNow = options.elapsedNow ?? (() =>
    typeof performance === 'undefined' ? Date.now() : performance.now());
  const queue: RecordedStudyEvent[] = [];
  let active: ActiveItem | null = null;
  let visible = options.initiallyVisible !== false;
  let signedOut = false;
  let generation = 0;
  let lastEventMs = -1;
  let failures = 0;
  let retryAt = 0;
  let activeController: AbortController | null = null;
  let inFlight: Promise<StudyEventFlushResult> | null = null;

  const state = () => ({
    pending: queue.length,
    nextRetryAt: retryAt > 0 && queue.length > 0 ? retryAt : null,
    signedOut,
  });

  function report(status: StudyEventFlushStatus, delivered = 0, dropped = 0): StudyEventFlushResult {
    return { status, delivered, dropped, pending: queue.length, nextRetryAt: state().nextRetryAt };
  }

  function setVisible(nextVisible: boolean): void {
    if (signedOut || visible === nextVisible) return;
    const tick = elapsedNow();
    if (!Number.isFinite(tick)) return;
    if (active) {
      if (!nextVisible && active.visibleSince !== null) {
        active.accumulatedMs += Math.max(0, tick - active.visibleSince);
        active.visibleSince = null;
      } else if (nextVisible && active.visibleSince === null) {
        active.visibleSince = tick;
      }
    }
    visible = nextVisible;
  }

  function beginItem(itemId: string, versionId: string): boolean {
    if (signedOut || !UUID.test(itemId) || !UUID.test(versionId)) return false;
    const tick = elapsedNow();
    if (!Number.isFinite(tick)) return false;
    active = {
      itemId, versionId, accumulatedMs: 0,
      visibleSince: visible ? tick : null,
    };
    return true;
  }

  function record(kind: StudyEventKind, mark?: StudyEventMark): RecordedStudyEvent | null {
    if (signedOut || !active || queue.length >= STUDY_EVENT_MAX_PENDING) return null;
    if (!['answered', 'marked', 'skipped'].includes(kind)) return null;
    if (kind === 'marked' ? (mark !== 'know' && mark !== 'learning') : mark !== undefined) return null;
    const timestamp = now();
    const tick = elapsedNow();
    if (!Number.isSafeInteger(timestamp) || !finiteClock(timestamp) || !Number.isFinite(tick)) return null;
    // The database deduplicates by (user, at, version, kind). Give consecutive
    // actions distinct millisecond instants without changing timestamps on retry.
    const uniqueMs = Math.max(timestamp, lastEventMs + 1);
    if (uniqueMs - timestamp > MAX_CLOCK_LEAD_MS) return null;
    const elapsed = active.accumulatedMs + (active.visibleSince === null ? 0 :
      Math.max(0, tick - active.visibleSince));
    const ms_on_item = Math.min(STUDY_EVENT_MAX_MS, Math.max(0, Math.floor(elapsed)));
    const base = { item_id: active.itemId, version_id: active.versionId, ms_on_item, at: new Date(uniqueMs).toISOString() };
    const event: RecordedStudyEvent = kind === 'marked'
      ? Object.freeze({ ...base, kind, mark: mark! })
      : Object.freeze({ ...base, kind });
    queue.push(event);
    lastEventMs = uniqueMs;
    active.accumulatedMs = 0;
    active.visibleSince = visible ? tick : null;
    return event;
  }

  function signOut(): void {
    signedOut = true;
    generation += 1;
    activeController?.abort();
    activeController = null;
    active = null;
    queue.length = 0;
    retryAt = 0;
    failures = 0;
  }

  async function drain(): Promise<StudyEventFlushResult> {
    if (signedOut) return report('signed-out');
    if (queue.length === 0) return report('idle');
    if (now() < retryAt) return report('retry');
    let delivered = 0;
    while (queue.length) {
      if (signedOut) return report('signed-out');
      const batch = Object.freeze(queue.slice(0, STUDY_EVENT_BATCH_SIZE));
      const revision = generation;
      const controller = new AbortController();
      activeController = controller;
      try {
        const stored = await options.send(batch, controller.signal);
        if (signedOut || revision !== generation) return report('signed-out');
        if (!Number.isInteger(stored) || stored < 0 || stored > batch.length) {
          throw new Error('Unexpected study-event RPC result.');
        }
        // The RPC accepted the entire batch. Some rows may already exist from
        // an earlier request; a zero count still means the retry succeeded.
        queue.splice(0, batch.length);
        delivered += batch.length;
        failures = 0;
        retryAt = 0;
      } catch (error) {
        if (signedOut || revision !== generation) return report('signed-out');
        const message = errorMessage(error);
        if (message === 'sign in to record study activity') {
          signOut();
          return report('signed-out');
        }
        if ([
          'a study event names a question that was not found',
          'a study event has the wrong shape',
          'send between 1 and 50 study events',
          'a study event time must be between 7 days ago and 5 minutes from now',
        ].includes(message)) {
          queue.splice(0, batch.length);
          failures = 0;
          retryAt = 0;
          return report('dropped', delivered, batch.length);
        }
        if (message === 'too many study events recorded recently; try again later') {
          failures = 0;
          retryAt = now() + STUDY_EVENT_RATE_LIMIT_MS;
        } else {
          failures += 1;
          retryAt = now() + Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.min(failures - 1, 6));
        }
        return report('retry', delivered);
      } finally {
        if (activeController === controller) activeController = null;
      }
    }
    return report('complete', delivered);
  }

  function flush(): Promise<StudyEventFlushResult> {
    if (inFlight) return inFlight;
    const running = drain().finally(() => { inFlight = null; });
    inFlight = running;
    return running;
  }

  return { beginItem, endItem: () => { active = null; }, setVisible,
    record: record as StudyEventQueue['record'], flush, signOut, state };
}
