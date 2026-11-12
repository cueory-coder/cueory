import { describe, expect, it } from 'vitest';
import {
  forget, fromSudokuCompletion, parseStats, recordResult, serialize, statInWords, sudokuInWords, summary, summaryInWords,
  type LegacyGameId, type GameResult, type GameStats,
} from '../../src/islands/gamestats';

const result = (game: LegacyGameId = 'pulse', day = '2026-11-01', solved = true, tries = 3): GameResult => ({ game, day, solved, tries });
const saved = (results: unknown[], version: unknown = 1) => JSON.stringify({ version, results });
const dayAt = (offset: number) => new Date(Date.UTC(2025, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);

describe('private daily-game results', () => {
  it('keeps the first result, even when a replay is solved or took fewer tries', () => {
    const first = recordResult([], result('pulse', '2026-11-01', false, 7));
    expect(recordResult(first, result('pulse', '2026-11-01', true, 1))).toBe(first);
    expect(first).toEqual([result('pulse', '2026-11-01', false, 7)]);
  });
  it('keeps games independent on the same day', () => {
    let stats: GameStats = [];
    for (const game of ['pulse', 'cueword', 'triage', 'suture'] as const) stats = recordResult(stats, result(game));
    expect(stats).toHaveLength(4);
    expect(summary(stats, 'triage')).toEqual({ played: 1, solved: 1, triesCounts: { 3: 1 } });
  });
  it('does not mutate the history or retain a mutable reference to new input', () => {
    const before = Object.freeze([Object.freeze(result())]);
    const next = result('suture');
    const stats = recordResult(before, next);
    next.tries = 99;
    expect(before).toHaveLength(1);
    expect(stats[1]?.tries).toBe(3);
  });
  it('keeps exactly the last 400 calendar days for each game', () => {
    let stats: GameStats = [result('triage', '2024-01-01')];
    for (let i = 0; i < 401; i++) stats = recordResult(stats, result('pulse', dayAt(i)));
    expect(stats.filter((entry) => entry.game === 'pulse')).toHaveLength(400);
    expect(stats.some((entry) => entry.game === 'pulse' && entry.day === dayAt(0))).toBe(false);
    expect(stats.some((entry) => entry.day === dayAt(1))).toBe(true);
    expect(stats[0]).toEqual(result('triage', '2024-01-01'));
  });
  it('trims by calendar distance across gaps and handles results arriving out of order', () => {
    const newest = result('pulse', dayAt(500));
    let stats = recordResult([result('pulse', dayAt(0))], newest);
    expect(stats).toEqual([newest]);
    stats = recordResult(stats, result('pulse', dayAt(101)));
    expect(stats).toHaveLength(2); // exactly 399 days before the newest
    expect(recordResult(stats, result('pulse', dayAt(100)))).toEqual(stats);
    expect(recordResult(stats, result('pulse', dayAt(0)))).toEqual(stats);
  });
  it.each([
    null, undefined, [], {}, { ...result(), game: 'other' }, { ...result(), solved: 1 },
    { ...result(), tries: -1 }, { ...result(), tries: 1.5 }, { ...result(), tries: NaN },
    { ...result(), tries: Infinity }, { ...result(), tries: Number.MAX_SAFE_INTEGER + 1 },
    { ...result(), tries: '3' }, { ...result(), day: '2026-02-30' },
    { ...result(), day: '2026-02-29' }, { ...result(), day: '2026-1-01' },
    { ...result(), day: '0000-01-01' }, { ...result(), day: '2026-11-01T00:00:00Z' },
  ])('ignores bad result %j without throwing', (bad) => {
    const stats = [result()];
    expect(recordResult(stats, bad)).toBe(stats);
  });
  it('accepts zero tries, leap days and early four-digit years', () => {
    expect(recordResult([], result('pulse', '2028-02-29', false, 0))).toHaveLength(1);
    expect(recordResult([], result('pulse', '0099-12-31'))).toHaveLength(1);
  });
  it('ignores a result with unreadable properties', () => {
    const input = { get game() { throw new Error('old caller'); } };
    expect(recordResult([], input)).toEqual([]);
  });
});

describe('summaries', () => {
  it('counts results for one game, with a histogram including unsolved games', () => {
    const stats = [result('pulse', dayAt(1), true, 2), result('pulse', dayAt(2), false, 7),
      result('pulse', dayAt(3), true, 2), result('pulse', dayAt(4), false, 0), result('suture')];
    expect(summary(stats, 'pulse')).toEqual({ played: 4, solved: 2, triesCounts: { 0: 1, 2: 2, 7: 1 } });
    expect(summary(stats, 'unknown')).toEqual({ played: 0, solved: 0, triesCounts: {} });
  });
  it('uses plain words, with singular and empty summaries', () => {
    expect(summaryInWords({ played: 12, solved: 10, triesCounts: {} })).toBe('played 12 days, solved 10.');
    expect(summaryInWords(summary([result()], 'pulse'))).toBe('played 1 day, solved 1.');
    expect(summaryInWords(summary([], 'pulse'))).toBe('played 0 days, solved 0.');
  });
  it('does not put pressure words, percentages or internal game names in visible summaries', () => {
    for (const game of ['pulse', 'cueword', 'triage', 'suture']) {
      const words = summaryInWords(summary([result()], game));
      expect(words).not.toMatch(/streak|missed|%|pulse|cueword|triage|suture/i);
    }
  });
});

describe('versioned data and forgetting', () => {
  it('round-trips without sharing references', () => {
    const stats = [result(), result('suture', '2026-11-02', false, 0)];
    const text = serialize(stats);
    expect(JSON.parse(text).version).toBe(1);
    const parsed = parseStats(text);
    expect(parsed).toEqual(stats);
    expect(parsed).not.toBe(stats);
    expect(parsed[0]).not.toBe(stats[0]);
  });
  it.each(['broken', '', 'null', '[]', '1', '{}', saved([], 0), saved([], 2), saved([], '1'),
    JSON.stringify({ version: 1, results: {} }), saved([result(), { ...result('suture'), tries: -1 }]),
  ])('starts empty for bad or old saved data %j', (text) => expect(parseStats(text)).toEqual([]));
  it('starts empty for non-text input', () => {
    for (const input of [undefined, null, 1, {}, []]) expect(parseStats(input)).toEqual([]);
  });
  it('keeps the first saved result for a duplicate game/day', () => {
    const first = result('pulse', '2026-11-01', false, 7);
    expect(parseStats(saved([first, result()]))).toEqual([first]);
  });
  it('enforces retention while reading saved data too', () => {
    expect(parseStats(saved([result('pulse', dayAt(0)), result('pulse', dayAt(400)), result('suture', dayAt(0))])))
      .toEqual([result('pulse', dayAt(400)), result('suture', dayAt(0))]);
  });
  it('does not serialize or retain extra personal data or caller fields', () => {
    const extra = { ...result(), email: 'placeholder', displayName: 'placeholder', other: { note: 'placeholder' } };
    const stats = recordResult([], extra);
    expect(stats).toEqual([result()]);
    expect(serialize([extra])).not.toMatch(/placeholder|email|displayName|other/);
    expect(parseStats(saved([extra]))).toEqual([result()]);
  });
  it('serializes bad typed entries as an empty record and leaves valid inputs untouched', () => {
    const bad = [{ ...result(), tries: -1 }];
    expect(parseStats(serialize(bad))).toEqual([]);
    expect(parseStats(serialize(new Array<GameResult>(1)))).toEqual([]);
    const stats = Object.freeze([Object.freeze(result())]);
    expect(parseStats(serialize(stats))).toEqual(stats);
  });
  it('clears one game or all games, without mutating the original', () => {
    const stats = Object.freeze([Object.freeze(result()), Object.freeze(result('suture'))]);
    expect(forget(stats, 'pulse')).toEqual([result('suture')]);
    expect(forget(stats, 'unknown')).toEqual(stats);
    expect(forget(stats)).toEqual([]);
    expect(stats).toHaveLength(2);
  });
});

describe('separate sudoku, stat and retired sort stats', () => {
  const sort = result('triage', '2026-11-01', true, 2);
  const easy = { game: 'sudoku', day: '2026-11-01', solved: true, tries: 1, level: 'easy', seconds: 95 } as const;
  const medium = { game: 'sudoku', day: '2026-11-01', solved: true, tries: 0, level: 'medium', seconds: 120 } as const;
  const stat1 = { game: 'stat', day: '2026-11-01', solved: true, tries: 5, score: 10 } as const;
  const stat2 = { game: 'stat', day: '2026-11-02', solved: true, tries: 2, score: 13 } as const;

  it('reads version-1 sort history while keeping new sudoku and stat ids separate', () => {
    const stats = parseStats(saved([sort, easy, medium, stat1]));
    expect(stats).toEqual([sort, easy, medium, stat1]);
    expect(summary(stats, 'triage').played).toBe(1);
    expect(summary(stats, 'sudoku')).toEqual({ played: 2, solved: 2, triesCounts: { 0: 1, 1: 1 } });
    expect(summary(stats, 'stat').played).toBe(1);
    expect(sudokuInWords([sort])).toBe('not played yet.');
    expect(statInWords([sort])).toBe('not played yet.');
    expect(parseStats(serialize(stats))).toEqual(stats);
  });

  it('allows all three sudoku difficulties on one day but retains the first round per level and day', () => {
    let stats = recordResult([], easy);
    stats = recordResult(stats, medium);
    stats = recordResult(stats, { ...medium, level: 'hard', seconds: 240 });
    expect(stats).toHaveLength(3);
    expect(recordResult(stats, { ...easy, seconds: 50 })).toBe(stats);
    expect(parseStats(saved([easy, { ...easy, seconds: 50 }, medium]))).toEqual([easy, medium]);
  });

  it('shows stat best score and longest streak of consecutive days, even with gaps', () => {
    const rounds = [stat1, stat2, { ...stat1, day: '2026-11-04', score: 15, tries: 0 }];
    expect(statInWords(rounds)).toBe('played 3 days. best score 15 out of 15. longest daily streak 2 days.');
    expect(statInWords([stat1])).toBe('played 1 day. best score 10 out of 15. longest daily streak 1 day.');
    expect(statInWords([])).toBe('not played yet.');
  });

  it('shows solved counts and best time per level in words', () => {
    const stats = [sort, easy, medium, { ...easy, day: '2026-11-02', seconds: 62 }];
    expect(sudokuInWords(stats)).toBe(
      'solved 3 puzzles. easy: best time 1 minute 2 seconds. medium: best time 2 minutes 0 seconds. hard: not solved yet.',
    );
    expect(sudokuInWords([easy])).toContain('solved 1 puzzle.');
  });

  it('converts only valid sudoku completion events and strips extra fields', () => {
    expect(fromSudokuCompletion({
      game: 'sudoku', day: easy.day, solved: true, level: 'easy',
      seconds: 95, errors: 1, time: '01:35', privateNote: '[sample clue]',
    })).toEqual(easy);
    for (const invalid of [
      {}, null, { ...easy, errors: -1 }, { ...easy, errors: 0.5 },
      { ...easy, errors: 1, seconds: -1 }, { ...easy, errors: 1, level: 'expert' },
      { ...easy, errors: 1, solved: false }, { ...easy, errors: 1, game: 'triage' },
    ]) expect(fromSudokuCompletion(invalid)).toBeUndefined();
    expect(fromSudokuCompletion({ get game() { throw new Error('broken'); } })).toBeUndefined();
  });

  it('rejects corrupt new records rather than mixing them with valid old records', () => {
    const bad = [
      { ...easy, level: 'expert' }, { ...easy, seconds: -1 }, { ...easy, seconds: '95' },
      { ...easy, solved: false }, { ...stat1, score: 16 }, { ...stat1, score: 5 },
      { ...stat1, score: 12.5 }, { ...stat1, solved: false },
    ];
    for (const invalid of bad) {
      expect(recordResult([sort], invalid)).toEqual([sort]);
      expect(parseStats(saved([sort, invalid]))).toEqual([]);
    }
  });

  it('forgets one new id without deleting other games or retired sort data', () => {
    const stats = [sort, easy, medium, stat1];
    expect(forget(stats, 'sudoku')).toEqual([sort, stat1]);
    expect(forget(stats, 'stat')).toEqual([sort, easy, medium]);
    expect(forget(stats, 'triage')).toEqual([easy, medium, stat1]);
    expect(forget(stats)).toEqual([]);
  });
});
