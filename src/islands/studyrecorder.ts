/**
 * Sends study events from the real-questions player (Task 147), using the in-memory queue from Task 146
 * (`src/scripts/studyeventqueue.ts`) and `record_study_events` from
 * `supabase/migrations/20261102100000_study_events.sql`.
 *
 * - It sends nothing when accounts are off (the shared client is `null`), when nobody is signed in, or when the
 *   signed-in person changes. Sample questions never get a recorder, and their ids are not UUIDs, so the queue
 *   would refuse them anyway.
 * - An event holds only the item id, the published version id, what happened (answered, marked or skipped, with the
 *   mark), the visible time on the item and when. Never question text, choices, the picked answer, correctness or
 *   rationales.
 * - Batches go out when 50 are waiting, when the tab is hidden or the page is left, and on a timer. The queue decides
 *   what each server refusal means (lead's amendment to Task 146) and when a retry is allowed.
 * - Signing out clears every event still waiting.
 *
 * RPC call: https://supabase.com/docs/reference/javascript/rpc (`abortSignal` cancels it on sign-out:
 * https://supabase.com/docs/reference/javascript/db-abortsignal). Sign-out events:
 * https://supabase.com/docs/reference/javascript/auth-onauthstatechange
 */
import {
  createStudyEventQueue,
  STUDY_EVENT_BATCH_SIZE,
  type RecordedStudyEvent,
  type StudyEventMark,
  type StudyEventSender,
} from '../scripts/studyeventqueue';
import { sessionStateFrom, type SessionReader } from './supabaseclient';

/** How long an event may wait before its batch is sent anyway. */
export const STUDY_EVENT_FLUSH_MS = 30_000;
/** What record_study_events raises for a signed-out caller. The queue clears itself when it sees it. */
export const STUDY_EVENT_SIGNED_OUT = 'sign in to record study activity';

/** The parts of the shared Supabase client the recorder uses. */
export interface StudyEventClient extends SessionReader {
  rpc(fn: 'record_study_events', args: { events: RecordedStudyEvent[] }): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
  auth: SessionReader['auth'] & {
    onAuthStateChange(callback: (event: string, session: { user?: { id?: unknown } | null } | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}

interface Listenable {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
interface VisibilitySource extends Listenable { readonly visibilityState: string }

export interface StudyRecorderOptions {
  /** The shared lazy client (`getSupabase`), or a fake in tests. */
  getClient: () => Promise<StudyEventClient | null>;
  /** The page's document and window; default to the real ones. `null` turns those triggers off. */
  doc?: VisibilitySource | null;
  win?: Listenable | null;
  flushMs?: number;
  now?: () => number;
  elapsedNow?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface StudyRecorder {
  /** A real, published question is now on screen. Starts its visible time. */
  show(itemId: string, versionId: string): void;
  /** The question on screen was checked. */
  answered(): void;
  /** The item on screen was marked "know" or "still learning". */
  marked(mark: StudyEventMark): void;
  /** The item on screen was skipped. */
  skipped(): void;
  /** Nothing is on screen any more (checked, finished or closed). */
  leave(): void;
  /** Drops every waiting event and stops for good. */
  signOut(): void;
  /** The player is closing: sends what is waiting once, then stops. */
  close(): void;
  /** Settles after the client and session are known; true while the recorder may send. */
  readonly ready: Promise<boolean>;
}

const message = (error: unknown): string =>
  error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message : '';

/** Copies only the agreed keys, so nothing else can ever be sent, whatever the caller passes. */
function wireEvent(event: RecordedStudyEvent): RecordedStudyEvent {
  const base = { item_id: event.item_id, version_id: event.version_id, ms_on_item: event.ms_on_item, at: event.at };
  return event.kind === 'marked' ? { ...base, kind: 'marked', mark: event.mark } : { ...base, kind: event.kind };
}

/**
 * Calls record_study_events for the person who was signed in when the recorder started. If the browser's session
 * is gone or belongs to someone else, it reports the server's signed-out message, so the queue clears itself rather
 * than send one student's events under another student's sign-in.
 */
export function studyEventSender(client: StudyEventClient, ownerId: string): StudyEventSender {
  return async (events, signal) => {
    const session = await sessionStateFrom(client);
    if (!session.signedIn || session.userId !== ownerId) throw new Error(STUDY_EVENT_SIGNED_OUT);
    const { data, error } = await client.rpc('record_study_events', { events: events.map(wireEvent) })
      .abortSignal(signal);
    if (error !== null && error !== undefined) throw new Error(message(error) || 'study events were not recorded');
    return data as number;
  };
}

export function createStudyRecorder(options: StudyRecorderOptions): StudyRecorder {
  const doc = options.doc !== undefined ? options.doc : typeof document === 'undefined' ? null : document;
  const win = options.win !== undefined ? options.win : typeof window === 'undefined' ? null : window;
  const now = options.now ?? Date.now;
  const flushMs = options.flushMs ?? STUDY_EVENT_FLUSH_MS;
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let sender: StudyEventSender | null = null;
  let timer: unknown = null;
  let stopped = false;
  let closed = false;
  let unsubscribe: (() => void) | null = null;

  const queue = createStudyEventQueue({
    send: (events, signal) => sender ? sender(events, signal) : Promise.reject(new Error(STUDY_EVENT_SIGNED_OUT)),
    now,
    ...(options.elapsedNow ? { elapsedNow: options.elapsedNow } : {}),
    initiallyVisible: doc?.visibilityState !== 'hidden',
  });

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const onVisibility = () => {
    const visible = doc?.visibilityState !== 'hidden';
    queue.setVisible(visible);
    if (!visible) void flush();
  };
  const onPageHide = () => { void flush(); };
  const detach = () => {
    cancelTimer();
    doc?.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('pagehide', onPageHide);
  };
  const stop = () => {
    stopped = true;
    queue.signOut();
    detach();
    unsubscribe?.();
    unsubscribe = null;
  };

  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);

  const ready = (async () => {
    try {
      const client = await options.getClient();
      if (!client || stopped) return false;
      const session = await sessionStateFrom(client);
      if (!session.signedIn || stopped) return false;
      const owner = session.userId;
      const { data } = client.auth.onAuthStateChange((event, next) => {
        if (event === 'SIGNED_OUT' || !next?.user || next.user.id !== owner) stop();
      });
      unsubscribe = () => data.subscription.unsubscribe();
      if (stopped) return false;
      sender = studyEventSender(client, owner);
      return true;
    } catch {
      return false;
    }
  })().then(ok => {
    if (!ok) stop();
    else schedule();
    return ok;
  });

  /** One timer: the regular interval, or the queue's own retry time after a failure or the rate limit. */
  function schedule(replace = true): void {
    if (stopped || closed || (!replace && timer !== null)) return;
    cancelTimer();
    const { pending, nextRetryAt, signedOut } = queue.state();
    if (signedOut) return stop();
    if (pending === 0) return;
    const delay = nextRetryAt !== null ? Math.max(0, nextRetryAt - now()) : flushMs;
    timer = setTimer(() => { timer = null; void flush(); }, delay);
  }

  async function flush(): Promise<void> {
    await ready;
    if (stopped || closed || sender === null) return;
    const result = await queue.flush();
    if (result.status === 'signed-out') stop();
    else schedule();
  }

  function recorded(event: RecordedStudyEvent | null): void {
    if (!event || stopped || closed) return;
    if (queue.state().pending >= STUDY_EVENT_BATCH_SIZE) void flush();
    else schedule(false);
  }

  return {
    show(itemId, versionId) { if (!stopped && !closed) queue.beginItem(itemId, versionId); },
    answered() { recorded(queue.record('answered')); },
    marked(mark) { recorded(queue.record('marked', mark)); },
    skipped() { recorded(queue.record('skipped')); },
    leave() { queue.endItem(); },
    signOut: stop,
    close() {
      if (closed || stopped) return;
      closed = true;
      queue.endItem();
      detach();
      // One last send of what is waiting, then let go of the sign-in listener.
      void (async () => {
        await ready;
        if (!stopped && sender !== null) await queue.flush();
        unsubscribe?.();
        unsubscribe = null;
      })();
    },
    ready,
  };
}

/** Maps the player's public question ids to their published version ids for the recorder. */
export interface QuestionEvents {
  shown(questionId: string): void;
  answered(): void;
  left(): void;
}
export function questionEvents(recorder: StudyRecorder, versions: readonly { item_id: string; id: string }[]): QuestionEvents {
  const byItem = new Map(versions.map(version => [version.item_id, version.id]));
  return {
    shown(questionId) {
      const versionId = byItem.get(questionId);
      if (versionId === undefined) recorder.leave();
      else recorder.show(questionId, versionId);
    },
    answered: () => recorder.answered(),
    left: () => recorder.leave(),
  };
}
