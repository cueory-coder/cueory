import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STUDY_EVENT_BATCH_SIZE, STUDY_EVENT_RATE_LIMIT_MS, type RecordedStudyEvent } from '../../src/scripts/studyeventqueue';
import {
  createStudyRecorder, questionEvents, STUDY_EVENT_FLUSH_MS, type StudyEventClient, type StudyRecorder,
} from '../../src/islands/studyrecorder';

// Invented ids only, never question-bank data or a real account.
const USER = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const ITEM = '00000000-0000-4000-8000-0000000000e1';
const VERSION = '00000000-0000-4000-8000-0000000000f1';
const ITEM2 = '00000000-0000-4000-8000-0000000000e2';
const VERSION2 = '00000000-0000-4000-8000-0000000000f2';
const START = Date.parse('2026-11-02T12:00:00.000Z');
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0)); };

type Reply = { data: unknown; error: unknown } | Error;
type AuthCallback = (event: string, session: { user?: { id?: unknown } | null } | null) => void;

function setup(opts: { client?: 'off' | 'fails'; userId?: string | null; replies?: Reply[]; hidden?: boolean } = {}) {
  let wall = START;
  let ticks = 0;
  const replies = [...(opts.replies ?? [])];
  const sent: { fn: string; args: { events: RecordedStudyEvent[] }; signal: AbortSignal }[] = [];
  const timers: { run: () => void; ms: number; cleared: boolean }[] = [];
  const authListeners: AuthCallback[] = [];
  let unsubscribed = 0;
  let sessionUser: string | null = opts.userId === undefined ? USER : opts.userId;
  const client: StudyEventClient = {
    rpc(fn, args) {
      return {
        abortSignal(signal) {
          sent.push({ fn, args: structuredClone(args), signal });
          const reply = replies.shift() ?? { data: args.events.length, error: null };
          return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
        },
      };
    },
    auth: {
      getSession: async () => ({ data: { session: sessionUser ? { user: { id: sessionUser, email: '' } } : null }, error: null }),
      onAuthStateChange(callback) {
        authListeners.push(callback);
        return { data: { subscription: { unsubscribe() { unsubscribed++; } } } };
      },
    },
  };
  const doc = Object.assign(new EventTarget(), { visibilityState: opts.hidden ? 'hidden' : 'visible' });
  const win = new EventTarget();
  const recorder = createStudyRecorder({
    getClient: async () => {
      if (opts.client === 'fails') throw new Error('provider-private-detail');
      return opts.client === 'off' ? null : client;
    },
    doc, win,
    now: () => wall,
    elapsedNow: () => ticks,
    setTimer: (run, ms) => { const timer = { run, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimer: handle => { (handle as { cleared: boolean }).cleared = true; },
  });
  return {
    recorder, sent, timers, doc, win, authListeners,
    get unsubscribed() { return unsubscribed; },
    advance(ms: number) { wall += ms; ticks += ms; },
    setUser(id: string | null) { sessionUser = id; },
    hide() { doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); },
    showTab() { doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); },
    pagehide() { win.dispatchEvent(new Event('pagehide')); },
    live: () => timers.filter(timer => !timer.cleared),
    async fireTimer() {
      const timer = timers.filter(t => !t.cleared).at(-1);
      if (!timer) throw new Error('no timer is waiting');
      timer.cleared = true;
      timer.run();
      await settle();
    },
  };
}

/** Records one answered event on ITEM after `ms` of visible time. */
function answer(f: ReturnType<typeof setup>, ms = 1_000, item = ITEM, version = VERSION) {
  f.recorder.show(item, version);
  f.advance(ms);
  f.recorder.answered();
}
const ats = (events: RecordedStudyEvent[]) => events.map(event => event.at);

describe('Task 147: the recorder sends nothing it should not', () => {
  it('sends nothing and stops listening when accounts are off', async () => {
    const f = setup({ client: 'off' });
    answer(f);
    expect(await f.recorder.ready).toBe(false);
    f.pagehide();
    f.hide();
    await settle();
    expect(f.sent).toEqual([]);
    expect(f.live()).toEqual([]);
    expect(f.authListeners).toEqual([]);
  });

  it('sends nothing when the shared client fails to load', async () => {
    const f = setup({ client: 'fails' });
    answer(f);
    expect(await f.recorder.ready).toBe(false);
    f.pagehide();
    await settle();
    expect(f.sent).toEqual([]);
  });

  it('sends nothing when nobody is signed in', async () => {
    const f = setup({ userId: null });
    expect(await f.recorder.ready).toBe(false);
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toEqual([]);
    expect(f.authListeners).toEqual([]);
  });

  it('never records sample questions, whose ids are not published UUIDs', async () => {
    const f = setup();
    await f.recorder.ready;
    answer(f, 1_000, 'study-skills-01-q1', 'study-skills-01-q1');
    f.recorder.skipped();
    f.recorder.marked('know');
    f.pagehide();
    await settle();
    expect(f.sent).toEqual([]);
    expect(f.live()).toEqual([]);
  });
});

describe('Task 147: what is sent', () => {
  it('sends only the agreed keys to record_study_events, with visible time and no answer data', async () => {
    const f = setup();
    expect(await f.recorder.ready).toBe(true);
    f.recorder.show(ITEM, VERSION);
    f.advance(4_000);
    f.hide();
    f.advance(60_000); // the tab is hidden: not counted
    f.showTab();
    f.advance(1_500);
    f.recorder.answered();
    f.recorder.leave();
    f.recorder.show(ITEM2, VERSION2);
    f.advance(700);
    f.recorder.marked('learning');
    f.advance(300);
    f.recorder.skipped();
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
    const [{ fn, args }] = f.sent as [typeof f.sent[number]];
    expect(fn).toBe('record_study_events');
    // The argument name is the SQL one: record_study_events(events jsonb).
    const sql = readFileSync(new URL('../../supabase/migrations/20261102100000_study_events.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/create function public\.record_study_events\(events jsonb\)/);
    expect(Object.keys(args)).toEqual(['events']);
    expect(args.events).toEqual([
      { item_id: ITEM, version_id: VERSION, kind: 'answered', ms_on_item: 5_500, at: new Date(START + 65_500).toISOString() },
      { item_id: ITEM2, version_id: VERSION2, kind: 'marked', mark: 'learning', ms_on_item: 700, at: new Date(START + 66_200).toISOString() },
      { item_id: ITEM2, version_id: VERSION2, kind: 'skipped', ms_on_item: 300, at: new Date(START + 66_500).toISOString() },
    ]);
    expect(JSON.stringify(args)).not.toMatch(/picked|choice|correct|rationale|stem|key|user/);
  });

  it('starts with the tab hidden and counts only the visible part', async () => {
    const g = setup({ hidden: true });
    await g.recorder.ready;
    g.recorder.show(ITEM, VERSION);
    g.advance(9_000);
    g.showTab();
    g.advance(2_000);
    g.recorder.answered();
    g.pagehide();
    await settle();
    expect(g.sent[0]!.args.events[0]!.ms_on_item).toBe(2_000);
  });

  it('records nothing after the question is checked and left', async () => {
    const f = setup();
    await f.recorder.ready;
    answer(f);
    f.recorder.leave();
    f.recorder.answered();
    f.pagehide();
    await settle();
    expect(f.sent[0]!.args.events).toHaveLength(1);
  });
});

describe('Task 147: when batches go out', () => {
  it('waits on a timer, then sends', async () => {
    const f = setup();
    await f.recorder.ready;
    answer(f);
    expect(f.sent).toEqual([]);
    expect(f.live().map(timer => timer.ms)).toEqual([STUDY_EVENT_FLUSH_MS]);
    answer(f); // a second event does not push the timer back
    expect(f.live()).toHaveLength(1);
    await f.fireTimer();
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]!.args.events).toHaveLength(2);
    expect(f.live()).toEqual([]);
  });

  it('sends as soon as a full batch of 50 is waiting', async () => {
    const f = setup();
    await f.recorder.ready;
    for (let i = 0; i < STUDY_EVENT_BATCH_SIZE; i++) answer(f, 10);
    await settle();
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]!.args.events).toHaveLength(STUDY_EVENT_BATCH_SIZE);
  });

  it('sends when the tab is hidden', async () => {
    const f = setup();
    await f.recorder.ready;
    answer(f);
    f.hide();
    await settle();
    expect(f.sent).toHaveLength(1);
  });

  it('sends when the page is left', async () => {
    const f = setup();
    await f.recorder.ready;
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
  });

  it('sends events recorded before the client was ready', async () => {
    const f = setup();
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
  });

  it('closing the player sends what is waiting once, then stops listening', async () => {
    const f = setup();
    await f.recorder.ready;
    answer(f);
    f.recorder.close();
    await settle();
    expect(f.sent).toHaveLength(1);
    expect(f.unsubscribed).toBe(1);
    f.recorder.show(ITEM, VERSION);
    f.recorder.answered();
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
  });
});

describe('Task 147: each server message, as amended by the lead', () => {
  const error = (message: string) => ({ data: null, error: { message, code: '22023' } });

  for (const message of [
    'a study event names a question that was not found',
    'a study event has the wrong shape',
    'send between 1 and 50 study events',
    'a study event time must be between 7 days ago and 5 minutes from now',
  ]) it(`drops the batch for "${message}" and never resends it`, async () => {
    const f = setup({ replies: [error(message)] });
    await f.recorder.ready;
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
    const dropped = f.sent[0]!.args.events[0]!.at;
    expect(f.live()).toEqual([]);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
    answer(f); // later events still go
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(2);
    expect(ats(f.sent[1]!.args.events)).not.toContain(dropped);
  });

  it('holds the batch for 15 minutes when the rate limit is reached, then resends the same times', async () => {
    const f = setup({ replies: [{ data: null, error: { message: 'too many study events recorded recently; try again later', code: '54000' } }] });
    await f.recorder.ready;
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
    expect(f.live().map(timer => timer.ms)).toEqual([STUDY_EVENT_RATE_LIMIT_MS]);
    f.hide(); // too soon: nothing is sent
    await settle();
    expect(f.sent).toHaveLength(1);
    f.advance(STUDY_EVENT_RATE_LIMIT_MS);
    await f.fireTimer();
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1]!.args.events).toEqual(f.sent[0]!.args.events);
  });

  it('retries network errors with growing delays, resending the same times', async () => {
    const f = setup({ replies: [
      { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } },
      new Error('network down'),
    ] });
    await f.recorder.ready;
    answer(f);
    f.pagehide();
    await settle();
    expect(f.live().map(timer => timer.ms)).toEqual([1_000]);
    f.advance(1_000);
    await f.fireTimer();
    expect(f.live().map(timer => timer.ms)).toEqual([2_000]);
    f.advance(2_000);
    await f.fireTimer();
    expect(f.sent).toHaveLength(3);
    expect(ats(f.sent[2]!.args.events)).toEqual(ats(f.sent[0]!.args.events));
    expect(f.live()).toEqual([]);
  });

  it('clears everything when the server says to sign in', async () => {
    const f = setup({ replies: [error('sign in to record study activity')] });
    await f.recorder.ready;
    answer(f);
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
    expect(f.unsubscribed).toBe(1);
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
    expect(f.live()).toEqual([]);
  });
});

describe('Task 147: signing out', () => {
  async function signedOutBy(act: (f: ReturnType<typeof setup>) => void) {
    const f = setup();
    await f.recorder.ready;
    answer(f);
    act(f);
    answer(f);
    f.pagehide();
    await f.fireTimer().catch(() => undefined);
    await settle();
    expect(f.sent).toEqual([]);
    expect(f.live()).toEqual([]);
    return f;
  }

  it('clears waiting events on a SIGNED_OUT event', async () => {
    const f = await signedOutBy(g => g.authListeners[0]!('SIGNED_OUT', null));
    expect(f.unsubscribed).toBe(1);
  });

  it('clears waiting events when another account signs in', async () => {
    await signedOutBy(g => g.authListeners[0]!('SIGNED_IN', { user: { id: OTHER } }));
  });

  it('keeps going on a token refresh for the same person', async () => {
    const f = setup();
    await f.recorder.ready;
    f.authListeners[0]!('INITIAL_SESSION', { user: { id: USER } });
    f.authListeners[0]!('TOKEN_REFRESHED', { user: { id: USER } });
    answer(f);
    f.pagehide();
    await settle();
    expect(f.sent).toHaveLength(1);
  });

  it('clears waiting events when the player calls signOut, and sends nothing on the way out', async () => {
    const f = await signedOutBy(g => g.recorder.signOut());
    f.recorder.close();
    await settle();
    expect(f.sent).toEqual([]);
  });

  it('never sends under a different session found at send time', async () => {
    for (const user of [null, OTHER]) {
      const f = setup();
      await f.recorder.ready;
      answer(f);
      f.setUser(user);
      f.pagehide();
      await settle();
      expect(f.sent).toEqual([]);
      answer(f);
      f.pagehide();
      await settle();
      expect(f.sent).toEqual([]);
    }
  });

  it('cancels a request that is in flight', async () => {
    let release!: () => void;
    const slow = setupSlow(new Promise<void>(resolve => { release = resolve; }));
    await slow.recorder.ready;
    answer(slow.harness);
    slow.harness.pagehide();
    await settle();
    expect(slow.signals).toHaveLength(1);
    expect(slow.signals[0]!.aborted).toBe(false);
    slow.recorder.signOut();
    expect(slow.signals[0]!.aborted).toBe(true);
    release();
    await settle();
  });
});

/** A recorder whose request stays open until `hold` settles. */
function setupSlow(hold: Promise<void>) {
  const signals: AbortSignal[] = [];
  const win = new EventTarget();
  let wall = START;
  let ticks = 0;
  const client: StudyEventClient = {
    rpc: (_fn, args) => ({ abortSignal(signal) { signals.push(signal); return hold.then(() => ({ data: args.events.length, error: null })); } }),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: USER, email: '' } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
  const recorder: StudyRecorder = createStudyRecorder({
    getClient: async () => client, doc: null, win, now: () => wall, elapsedNow: () => ticks,
    setTimer: () => ({}), clearTimer: () => {},
  });
  return {
    recorder, signals,
    harness: {
      recorder,
      advance(ms: number) { wall += ms; ticks += ms; },
      pagehide() { win.dispatchEvent(new Event('pagehide')); },
    } as unknown as ReturnType<typeof setup>,
  };
}

describe('Task 147: question ids to published versions', () => {
  it('passes the published version for each question and leaves on an unknown one', () => {
    const calls: unknown[][] = [];
    const recorder = {
      show: (...args: unknown[]) => calls.push(['show', ...args]),
      answered: () => calls.push(['answered']),
      leave: () => calls.push(['leave']),
    } as unknown as StudyRecorder;
    const events = questionEvents(recorder, [{ item_id: ITEM, id: VERSION }, { item_id: ITEM2, id: VERSION2 }]);
    events.shown(ITEM2);
    events.answered();
    events.left();
    events.shown('not-published');
    expect(calls).toEqual([['show', ITEM2, VERSION2], ['answered'], ['leave'], ['leave']]);
  });
});
