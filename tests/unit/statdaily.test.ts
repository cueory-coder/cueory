import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { statUsesRealQuestions } from '../../src/config/games';
import { remoteStatGrader, STAT_QUESTIONS } from '../../src/islands/stat';
import {
  isDay, loadDailyStatSet, openDailyStat, parseDailyStatSet, refusalView, STAT_PATH,
  type DailyStatClient,
} from '../../src/islands/statdaily';
import type { SessionState } from '../../src/islands/supabaseclient';

// Invented, non-clinical fixtures only: bracketed sample text and made-up ids. Nothing here comes from a database.
const DAY = '2026-11-12';
const id = (kind: 1 | 2, n: number) => `00000000-0000-4000-8000-${String(kind * 1000 + n).padStart(12, '0')}`;
const row = (n: number) => ({
  position: n,
  item_id: id(1, n),
  version_id: id(2, n),
  stem: `[sample question ${n}]`,
  choices: (['a', 'b', 'c', 'd'] as const).map(letter => ({ id: letter, text: `[sample choice ${letter}]` })),
});
const reply = () => ({ day: DAY, questions: Array.from({ length: STAT_QUESTIONS }, (_, index) => row(index + 1)) });
const signedIn: SessionState = { signedIn: true, userId: id(1, 999), email: 'student@example.com' };
const noon = new Date(2026, 10, 12, 12, 0, 0);

type Rpc = (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;
function client(rpc: Rpc): DailyStatClient {
  return { rpc: vi.fn(rpc) } as unknown as DailyStatClient;
}

describe('the flag', () => {
  it('real stat questions are off until Christian approves the database change', () => {
    expect(statUsesRealQuestions).toBe(false);
  });
});

describe('isDay', () => {
  it('accepts real calendar days only', () => {
    expect(isDay('2026-11-12')).toBe(true);
    expect(isDay('2028-02-29')).toBe(true);
    for (const value of ['2026-02-30', '2026-13-01', '2026-1-1', '20261112', '', null, 20261112, '2026-11-12T00:00:00Z']) {
      expect(isDay(value)).toBe(false);
    }
  });
});

describe('parseDailyStatSet', () => {
  it('reads fifteen questions and keeps each published version for check_answer', () => {
    const set = parseDailyStatSet(reply(), DAY);
    expect(set.day).toBe(DAY);
    expect(set.questions).toHaveLength(STAT_QUESTIONS);
    expect(set.questions[0]).toEqual({ id: id(1, 1), stem: '[sample question 1]', choices: row(1).choices });
    expect(set.versions[14]).toEqual({ item_id: id(1, 15), id: id(2, 15) });
  });

  it('refuses the whole reply when any field it does not know is present, such as an answer or a rationale', () => {
    for (const extra of ['key', 'answer', 'correct', 'rationales', 'rationale', 'is_correct']) {
      const withTop = { ...reply(), [extra]: 'a' };
      expect(() => parseDailyStatSet(withTop, DAY)).toThrow();
      const onQuestion = reply();
      (onQuestion.questions[3] as Record<string, unknown>)[extra] = 'a';
      expect(() => parseDailyStatSet(onQuestion, DAY)).toThrow();
      const onChoice = reply();
      (onChoice.questions[3]!.choices[1] as Record<string, unknown>)[extra] = true;
      expect(() => parseDailyStatSet(onChoice, DAY)).toThrow();
    }
  });

  it('refuses a reply for another day, the wrong count, or a wrong order', () => {
    expect(() => parseDailyStatSet(reply(), '2026-11-13')).toThrow();
    const short = reply(); short.questions.pop();
    expect(() => parseDailyStatSet(short, DAY)).toThrow();
    const long = reply(); long.questions.push(row(16));
    expect(() => parseDailyStatSet(long, DAY)).toThrow();
    const swapped = reply(); swapped.questions.reverse();
    expect(() => parseDailyStatSet(swapped, DAY)).toThrow();
  });

  it('refuses repeated questions, bad ids, and choices that are not exactly a to d', () => {
    const repeated = reply(); repeated.questions[5] = { ...row(1), position: 6 };
    expect(() => parseDailyStatSet(repeated, DAY)).toThrow();
    const badId = reply(); badId.questions[0]!.item_id = 'not-an-id';
    expect(() => parseDailyStatSet(badId, DAY)).toThrow();
    const three = reply(); three.questions[0]!.choices.pop();
    expect(() => parseDailyStatSet(three, DAY)).toThrow();
    const wrongLetter = reply(); (wrongLetter.questions[0]!.choices[3] as { id: string }).id = 'e';
    expect(() => parseDailyStatSet(wrongLetter, DAY)).toThrow();
    const shuffled = reply(); shuffled.questions[0]!.choices.reverse();
    expect(() => parseDailyStatSet(shuffled, DAY)).toThrow();
  });

  it('refuses empty, oversized or control-character text, and anything that is not a plain object', () => {
    const empty = reply(); empty.questions[0]!.stem = '   ';
    expect(() => parseDailyStatSet(empty, DAY)).toThrow();
    const long = reply(); long.questions[0]!.stem = 'x'.repeat(1001);
    expect(() => parseDailyStatSet(long, DAY)).toThrow();
    const longChoice = reply(); longChoice.questions[0]!.choices[0]!.text = 'x'.repeat(301);
    expect(() => parseDailyStatSet(longChoice, DAY)).toThrow();
    const control = reply(); control.questions[0]!.stem = 'sample\u0000text';
    expect(() => parseDailyStatSet(control, DAY)).toThrow();
    for (const value of [null, undefined, 'text', 15, [], [reply()]]) {
      expect(() => parseDailyStatSet(value, DAY)).toThrow();
    }
  });
});

describe('refusalView', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20261112090000_daily_stat_sets.sql', import.meta.url), 'utf8');
  const messages = [...migration.matchAll(/\braise\s+exception\s+'((?:[^']|'')*)'/gi)]
    .map(match => match[1]!.replace(/''/g, "'"));

  it('knows every refusal the draft database function can raise except the day window, and never shows its text', () => {
    expect(new Set(messages)).toEqual(new Set([
      "sign in to play today's set", 'confirm your email to use this', 'complete two-factor sign-in to continue',
      "that day's set is not open", "today's set is not ready yet",
    ]));
    expect(refusalView({ message: "sign in to play today's set" })).toEqual({ view: 'signed-out', next: STAT_PATH });
    expect(refusalView({ message: "today's set is not ready yet" })).toEqual({ view: 'not-ready' });
    expect(refusalView({ message: 'confirm your email to use this' })).toMatchObject({ view: 'blocked' });
    expect(refusalView({ message: 'complete two-factor sign-in to continue' })).toMatchObject({ view: 'blocked' });
    expect(refusalView({ message: "that day's set is not open" })).toEqual({ view: 'failed' });
  });

  it('turns anything else into a plain failure', () => {
    for (const error of [null, undefined, 'text', {}, { message: 5 }, { message: 'toString' }, { message: 'relation "x" does not exist' }]) {
      expect(refusalView(error)).toEqual({ view: 'failed' });
    }
  });

  it('the function is granted to signed-in students only and returns no answer columns', () => {
    expect(migration).toMatch(/revoke execute on function public\.daily_stat_set\(date\) from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.daily_stat_set\(date\) to authenticated;/);
    const code = migration.replace(/--[^\n]*/g, '');
    const grants = [...code.matchAll(/grant\s+execute\s+on\s+function\s+public\.daily_stat_set\(date\)\s+to\s+([^;]+);/gi)]
      .map(match => match[1]!.trim());
    expect(grants).toEqual(['authenticated']);
    expect(code).not.toMatch(/item_answers|rationale|is_correct/i);
  });
});

describe('loadDailyStatSet', () => {
  it('asks daily_stat_set for the day with exactly the argument the SQL names', async () => {
    const transport = client(async () => ({ data: reply(), error: null }));
    const loaded = await loadDailyStatSet(transport, DAY);
    expect(loaded.ok).toBe(true);
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith('daily_stat_set', { p_day: DAY });
  });

  it('never calls the database for something that is not a day', async () => {
    const transport = client(async () => ({ data: reply(), error: null }));
    expect(await loadDailyStatSet(transport, 'tomorrow')).toEqual({ ok: false, view: { view: 'failed' } });
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it('fails plainly on a refusal, a thrown error, or a reply with the wrong shape', async () => {
    const refused = client(async () => ({ data: null, error: { message: "today's set is not ready yet" } }));
    expect(await loadDailyStatSet(refused, DAY)).toEqual({ ok: false, view: { view: 'not-ready' } });
    const thrown = client(async () => { throw new Error('network'); });
    expect(await loadDailyStatSet(thrown, DAY)).toEqual({ ok: false, view: { view: 'failed' } });
    const leaky = client(async () => ({ data: { ...reply(), key: ['a'] }, error: null }));
    expect(await loadDailyStatSet(leaky, DAY)).toEqual({ ok: false, view: { view: 'failed' } });
  });
});

describe('openDailyStat', () => {
  it('asks nothing when accounts are off', async () => {
    const readSession = vi.fn();
    expect(await openDailyStat(async () => null, readSession, noon)).toEqual({ view: 'off' });
    expect(readSession).not.toHaveBeenCalled();
  });

  it('never sends a signed-out visitor to the database (D-86)', async () => {
    const transport = client(async () => ({ data: reply(), error: null }));
    const view = await openDailyStat(async () => transport, async () => ({ signedIn: false }), noon);
    expect(view).toEqual({ view: 'signed-out', next: '/play/stat' });
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it("gives a signed-in student the set for their own calendar day, with the client as check_answer's transport", async () => {
    const transport = client(async () => ({ data: reply(), error: null }));
    const view = await openDailyStat(async () => transport, async () => signedIn, noon);
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith('daily_stat_set', { p_day: DAY });
    if (view.view !== 'ready') throw new Error(`expected ready, got ${view.view}`);
    expect(view.remote.signedIn).toBe(true);
    expect(view.remote.transport).toBe(transport);
    expect(view.remote.versions).toEqual(view.set.versions);
  });

  it('fails plainly when the client or the session cannot be read', async () => {
    expect(await openDailyStat(async () => { throw new Error('download'); }, async () => signedIn, noon)).toEqual({ view: 'failed' });
    const transport = client(async () => ({ data: reply(), error: null }));
    expect(await openDailyStat(async () => transport, async () => { throw new Error('storage'); }, noon)).toEqual({ view: 'failed' });
    expect(transport.rpc).not.toHaveBeenCalled();
  });
});

describe("grading today's set", () => {
  it('sends each answered question to check_answer with its published version, and skips unanswered ones', async () => {
    const calls: { name: string; args: unknown }[] = [];
    const transport = client(async (name, args) => {
      calls.push({ name, args });
      if (name === 'daily_stat_set') return { data: reply(), error: null };
      const { version_id: versionId } = args as { version_id: string };
      return {
        data: {
          correct: true, key: ['b'], version_id: versionId,
          rationales: { a: '[sample feedback a]', b: '[sample feedback b]', c: '[sample feedback c]', d: '[sample feedback d]' },
        },
        error: null,
      };
    });
    const view = await openDailyStat(async () => transport, async () => signedIn, noon);
    if (view.view !== 'ready') throw new Error(`expected ready, got ${view.view}`);
    const grade = remoteStatGrader(view.set.questions, view.remote);
    expect(calls).toHaveLength(1);

    expect(await grade(view.set.questions[0]!, 'b')).toEqual({ right: true, key: 'b' });
    expect(calls[1]).toEqual({ name: 'check_answer', args: { item_id: id(1, 1), version_id: id(2, 1), picked: ['b'] } });
    expect(await grade(view.set.questions[1]!, null)).toEqual({ right: false, key: null });
    expect(calls).toHaveLength(2);
  });
});
