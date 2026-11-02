import { describe, expect, it, vi } from 'vitest';
import {
  createStudyEventQueue,
  STUDY_EVENT_BATCH_SIZE,
  STUDY_EVENT_MAX_MS,
  STUDY_EVENT_MAX_PENDING,
  STUDY_EVENT_RATE_LIMIT_MS,
  type RecordedStudyEvent,
  type StudyEventSender,
} from '../../src/scripts/studyeventqueue';

const ITEM = '00000000-0000-4000-8000-0000000000e1';
const VERSION = '00000000-0000-4000-8000-0000000000f1';
const START = Date.parse('2026-11-02T12:00:00.000Z');

function fixture(send: StudyEventSender = async events => events.length, initiallyVisible = true) {
  let wall = START;
  let ticks = 0;
  const queue = createStudyEventQueue({ send, initiallyVisible, now: () => wall, elapsedNow: () => ticks });
  return {
    queue,
    advance(ms: number) { wall += ms; ticks += ms; },
    moveTicks(ms: number) { ticks += ms; },
    moveWall(ms: number) { wall += ms; },
    item() { expect(queue.beginItem(ITEM, VERSION)).toBe(true); },
  };
}

describe('Task 146: private study-event shape and visible time', () => {
  it('records only the server-approved keys, with lowercase UUIDs and UTC timestamps', () => {
    const f = fixture();
    f.item();
    f.advance(12_345);
    f.moveTicks(0.6);
    const answered = f.queue.record('answered')!;
    expect(Object.keys(answered).sort()).toEqual(['at', 'item_id', 'kind', 'ms_on_item', 'version_id']);
    expect(answered).toEqual({
      item_id: ITEM, version_id: VERSION, kind: 'answered',
      ms_on_item: 12_345, at: new Date(START + 12_345).toISOString(),
    });
    expect(JSON.stringify(answered)).not.toMatch(/picked|answer_choice|correct|rationale|student|stem|question_text/);
    expect(Object.isFrozen(answered)).toBe(true);
    const marked = f.queue.record('marked', 'learning')!;
    expect(Object.keys(marked).sort()).toEqual(['at', 'item_id', 'kind', 'mark', 'ms_on_item', 'version_id']);
    expect(marked.mark).toBe('learning');
    expect(marked.ms_on_item).toBe(0);
    expect(f.queue.record('skipped')!.mark).toBeUndefined();
  });

  it('rejects non-UUID IDs, unknown kinds and invalid marks, even from unchecked JS callers', () => {
    const f = fixture();
    expect(f.queue.beginItem('sample-card', VERSION)).toBe(false);
    expect(f.queue.beginItem(ITEM.toUpperCase(), VERSION)).toBe(false);
    expect(f.queue.beginItem(ITEM, 'not-a-version')).toBe(false);
    expect(f.queue.record('answered')).toBeNull();
    f.item();
    const raw = f.queue.record as unknown as (kind: string, mark?: string) => RecordedStudyEvent | null;
    expect(raw('marked')).toBeNull();
    expect(raw('marked', 'wrong')).toBeNull();
    expect(raw('answered', 'know')).toBeNull();
    expect(raw('skipped', 'learning')).toBeNull();
    expect(raw('viewed')).toBeNull();
    expect(f.queue.state().pending).toBe(0);
    expect(f.queue.record('marked', 'know')?.mark).toBe('know');
    // Switching to a bad item must not attribute its actions to the prior item.
    expect(f.queue.beginItem('bad-next-item', VERSION)).toBe(false);
    expect(f.queue.record('answered')).toBeNull();
  });

  it('excludes time while hidden, including when first opened hidden, and resets between actions', () => {
    const f = fixture(undefined, false);
    f.item();
    f.advance(60_000); // hidden
    f.queue.setVisible(true);
    f.advance(8_500);
    f.queue.setVisible(false);
    f.advance(30_000); // hidden again
    f.queue.setVisible(true);
    f.advance(2_500);
    expect(f.queue.record('answered')?.ms_on_item).toBe(11_000);
    f.advance(10_000);
    expect(f.queue.record('marked', 'know')?.ms_on_item).toBe(10_000);
    f.queue.endItem();
    expect(f.queue.record('skipped')).toBeNull();
  });

  it('caps the event duration at 30 minutes and uses whole milliseconds', () => {
    const f = fixture();
    f.item();
    f.advance(STUDY_EVENT_MAX_MS + 9_999);
    expect(f.queue.record('skipped')?.ms_on_item).toBe(1_800_000);
  });

  it('gives repeated actions a unique UTC instant, preserving the server deduplication key', () => {
    const f = fixture();
    f.item();
    const first = f.queue.record('answered')!;
    const second = f.queue.record('answered')!;
    expect(first.at).toBe(new Date(START).toISOString());
    expect(second.at).toBe(new Date(START + 1).toISOString());
    expect(first.at).not.toBe(second.at);
  });

  it('does not lose the existing pending events when the in-memory capacity is reached', () => {
    const f = fixture();
    f.item();
    for (let i = 0; i < STUDY_EVENT_MAX_PENDING; i += 1) {
      expect(f.queue.record('answered')).not.toBeNull();
    }
    expect(f.queue.record('answered')).toBeNull();
    expect(f.queue.state().pending).toBe(STUDY_EVENT_MAX_PENDING);
  });
});

describe('Task 146: FIFO sender, batching and retry policy', () => {
  it('sends 112 events in FIFO batches of 50, 50 and 12 without changing their timestamps', async () => {
    const batches: RecordedStudyEvent[][] = [];
    const sender: StudyEventSender = async events => {
      batches.push([...events]);
      return events.length;
    };
    const f = fixture(sender);
    f.item();
    const events = Array.from({ length: 112 }, () => f.queue.record('answered')!);
    const result = await f.queue.flush();
    expect(batches.map(batch => batch.length)).toEqual([STUDY_EVENT_BATCH_SIZE, STUDY_EVENT_BATCH_SIZE, 12]);
    expect(batches.flat()).toEqual(events);
    expect(result).toEqual({ status: 'complete', delivered: 112, dropped: 0, pending: 0, nextRetryAt: null });
    expect((await f.queue.flush()).status).toBe('idle');
  });

  it('retries a network error with backoff, never regenerating an event or its at value', async () => {
    const batches: string[] = [];
    let calls = 0;
    const sender: StudyEventSender = async events => {
      calls += 1;
      batches.push(JSON.stringify(events));
      if (calls === 1) throw new Error('Network unavailable');
      return 0; // A previous delivery may have succeeded but its response was lost.
    };
    const f = fixture(sender);
    f.item();
    f.queue.record('answered');
    expect(await f.queue.flush()).toEqual({
      status: 'retry', delivered: 0, dropped: 0, pending: 1, nextRetryAt: START + 1_000,
    });
    expect((await f.queue.flush()).status).toBe('retry');
    expect(calls).toBe(1);
    f.advance(999);
    expect((await f.queue.flush()).status).toBe('retry');
    f.advance(1);
    expect((await f.queue.flush()).status).toBe('complete');
    expect(calls).toBe(2);
    expect(batches[1]).toBe(batches[0]);
    expect(f.queue.state().pending).toBe(0);
  });

  it('backs off exponentially for unknown failures, capped at one minute', async () => {
    const sender = vi.fn<StudyEventSender>(async () => { throw new Error('offline'); });
    const f = fixture(sender);
    f.item();
    f.queue.record('answered');
    let instant = START;
    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]) {
      const r = await f.queue.flush();
      expect(r.status).toBe('retry');
      expect(r.nextRetryAt).toBe(instant + delay);
      f.advance(delay);
      instant += delay;
    }
    expect(sender).toHaveBeenCalledTimes(8);
    expect(f.queue.state().pending).toBe(1);
  });

  it('honors the server rate limit for at least 15 minutes, preserving the batch', async () => {
    let calls = 0;
    const sender: StudyEventSender = async events => {
      calls += 1;
      if (calls === 1) throw new Error('too many study events recorded recently; try again later');
      return events.length;
    };
    const f = fixture(sender);
    f.item();
    f.queue.record('marked', 'learning');
    const retry = await f.queue.flush();
    expect(retry.status).toBe('retry');
    expect(retry.nextRetryAt).toBe(START + STUDY_EVENT_RATE_LIMIT_MS);
    f.advance(STUDY_EVENT_RATE_LIMIT_MS - 1);
    expect((await f.queue.flush()).status).toBe('retry');
    expect(calls).toBe(1);
    f.advance(1);
    expect((await f.queue.flush()).status).toBe('complete');
    expect(calls).toBe(2);
  });

  for (const message of [
    'a study event names a question that was not found',
    'a study event has the wrong shape',
    'send between 1 and 50 study events',
    'a study event time must be between 7 days ago and 5 minutes from now',
  ]) {
    it('drops a rejected batch without retrying: '+ message, async () => {
      const sender = vi.fn<StudyEventSender>(async () => { throw new Error(message); });
      const f = fixture(sender);
      f.item();
      for (let i = 0; i < 51; i += 1) f.queue.record('answered');
      expect(await f.queue.flush()).toEqual({
        status: 'dropped', delivered: 0, dropped: 50, pending: 1, nextRetryAt: null,
      });
      expect(sender).toHaveBeenCalledOnce();
    });
  }

  it('clears the queue for a server sign-in refusal and rejects later recordings', async () => {
    const sender: StudyEventSender = async () => { throw new Error('sign in to record study activity'); };
    const f = fixture(sender);
    f.item();
    f.queue.record('answered');
    expect((await f.queue.flush()).status).toBe('signed-out');
    expect(f.queue.state()).toEqual({ pending: 0, nextRetryAt: null, signedOut: true });
    expect(f.queue.record('skipped')).toBeNull();
    expect(f.queue.beginItem(ITEM, VERSION)).toBe(false);
  });

  it('does not count a noninteger or malformed RPC return as successful delivery', async () => {
    const f = fixture(async () => Number.NaN);
    f.item();
    f.queue.record('answered');
    expect((await f.queue.flush()).status).toBe('retry');
    expect(f.queue.state().pending).toBe(1);
  });

  it('shares one in-flight request, cancels on sign-out, and cannot flush old-session events', async () => {
    let finish!: (count: number) => void;
    let observed: AbortSignal | undefined;
    const sender: StudyEventSender = (_events, signal) => {
      observed = signal;
      return new Promise(resolve => { finish = resolve; });
    };
    const f = fixture(sender);
    f.item();
    f.queue.record('answered');
    const first = f.queue.flush();
    const second = f.queue.flush();
    expect(first).toBe(second);
    f.queue.signOut();
    expect(observed?.aborted).toBe(true);
    finish(1);
    expect((await first).status).toBe('signed-out');
    expect(f.queue.state()).toEqual({ pending: 0, nextRetryAt: null, signedOut: true });
    expect((await f.queue.flush()).status).toBe('signed-out');
  });
});
