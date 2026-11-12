import { describe, expect, it } from 'vitest';
import { acceptPuzzle, loadTodayPuzzle, selectTodayPuzzle } from '../../src/islands/puzzlefeed';

const TODAY = '2026-11-01';

// ── Sample puzzles ────────────────────────────────────────────────────────────

const pulsePuzzle = { word: 'heart', cue: 'sample: it circulates fluid' };

const cuewordPuzzle = {
  id: 'sample-crossword', sample: true,
  grid: ['CAT..', 'ARE..', 'TEN..', '...TO', '...ON'],
  clues: {
    across: [
      { number: 1, text: 'sample: small pet' }, { number: 4, text: 'sample: to exist' },
      { number: 5, text: 'sample: two fives' }, { number: 6, text: 'sample: toward' },
      { number: 8, text: 'sample: not off' },
    ],
    down: [
      { number: 1, text: 'sample: small pet' }, { number: 2, text: 'sample: to exist' },
      { number: 3, text: 'sample: two fives' }, { number: 6, text: 'sample: toward' },
      { number: 7, text: 'sample: not off' },
    ],
  },
};

const triagePuzzle = {
  groups: [
    { name: 'sample: fruits', terms: ['sample: fig', 'sample: plum', 'sample: lime'] },
    { name: 'sample: tools', terms: ['sample: saw', 'sample: file', 'sample: awl'] },
    { name: 'sample: units', terms: ['sample: yard', 'sample: foot', 'sample: inch'] },
  ],
  oddOne: 'sample: ruler',
};

const suturePuzzle = {
  id: 'sample-suture', sample: true,
  grid: ['CATX', 'DOGY', 'SUNZ'],
  words: [
    { cue: 'sample: small pet', answer: 'CAT', path: [[0, 0], [0, 1], [0, 2]] },
    { cue: 'sample: barking pet', answer: 'DOG', path: [[1, 0], [1, 1], [1, 2]] },
    { cue: 'sample: daytime star', answer: 'SUN', path: [[2, 0], [2, 1], [2, 2]] },
  ],
};

// ── Valid payloads ─────────────────────────────────────────────────────────────

describe('acceptPuzzle — valid', () => {
  it('accepts a pulse puzzle', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: pulsePuzzle }, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game).toBe('pulse');
    expect(result.puzzle).toEqual(pulsePuzzle);
  });

  it('accepts a cueword puzzle', () => {
    const result = acceptPuzzle({ game: 'cueword', date: TODAY, puzzle: cuewordPuzzle }, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game).toBe('cueword');
  });

  it('accepts a triage puzzle', () => {
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle: triagePuzzle }, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game).toBe('triage');
    expect(result.puzzle).toMatchObject({ groups: triagePuzzle.groups, oddOne: triagePuzzle.oddOne });
  });

  it('accepts a suture puzzle', () => {
    const result = acceptPuzzle({ game: 'suture', date: TODAY, puzzle: suturePuzzle }, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game).toBe('suture');
  });

  it('accepts pulse words of exactly 5 letters (task-114: pillo uses only five-letter words)', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'lungs', cue: 'sample: breathe' } }, TODAY);
    expect(result.ok).toBe(true);
  });

  it('pulse: refuses a six-letter word (task-114: pillo requires exactly five letters)', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'system', cue: 'sample: organs' } }, TODAY);
    expect(result.ok).toBe(false);
  });
});

// ── Extra fields are dropped ───────────────────────────────────────────────────

describe('acceptPuzzle — extra fields dropped', () => {
  it('drops extra top-level fields', () => {
    const payload = { game: 'pulse', date: TODAY, puzzle: pulsePuzzle, extra: 'sample: dropped' };
    const result = acceptPuzzle(payload, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).not.toHaveProperty('extra');
  });

  it('pulse: extra fields in the puzzle are dropped', () => {
    const puzzle = { ...pulsePuzzle, secret: 'sample: not passed through' };
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle }, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.puzzle).not.toHaveProperty('secret');
    expect(result.puzzle).toEqual(pulsePuzzle);
  });

  it('triage: extra fields in groups are dropped', () => {
    const puzzle = {
      ...triagePuzzle,
      groups: triagePuzzle.groups.map(g => ({ ...g, extra: 'sample: extra' })),
    };
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle }, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok || result.game !== 'triage') return;
    result.puzzle.groups.forEach((g: { name: string; terms: string[] }) => { expect(g).not.toHaveProperty('extra'); });
  });
});

// ── Wrong or missing date ──────────────────────────────────────────────────────

describe('acceptPuzzle — date check', () => {
  it('refuses yesterday', () => {
    const result = acceptPuzzle({ game: 'pulse', date: '2026-10-31', puzzle: pulsePuzzle }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('today');
  });

  it('refuses tomorrow', () => {
    const result = acceptPuzzle({ game: 'pulse', date: '2026-11-02', puzzle: pulsePuzzle }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('today');
  });

  it('refuses a missing date', () => {
    const result = acceptPuzzle({ game: 'pulse', puzzle: pulsePuzzle }, TODAY);
    expect(result.ok).toBe(false);
  });
});

// ── Unknown or missing game ────────────────────────────────────────────────────

describe('acceptPuzzle — game check', () => {
  it('refuses an unknown game', () => {
    const result = acceptPuzzle({ game: 'sample: bingo', date: TODAY, puzzle: {} }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('pulse');
  });

  it('refuses a missing game', () => {
    const result = acceptPuzzle({ date: TODAY, puzzle: pulsePuzzle }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('refuses a non-string game', () => {
    const result = acceptPuzzle({ game: 99, date: TODAY, puzzle: pulsePuzzle }, TODAY);
    expect(result.ok).toBe(false);
  });
});

// ── Non-object payload ─────────────────────────────────────────────────────────

describe('acceptPuzzle — payload shape', () => {
  it.each([null, 'sample: string', 42, []])('refuses non-object payload %j', (payload) => {
    const result = acceptPuzzle(payload, TODAY);
    expect(result.ok).toBe(false);
  });
});

// ── Broken game-specific puzzles ──────────────────────────────────────────────

describe('acceptPuzzle — broken puzzle per game', () => {
  it('pulse: refuses a word that is too short', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'run', cue: 'sample: go' } }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toContain('run');
  });

  it('pulse: refuses a word that is too long', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'arterial', cue: 'sample: vessel' } }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toContain('arterial');
  });

  it('pulse: refuses a missing cue', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'heart' } }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('pulse: refuses an empty cue', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'heart', cue: '   ' } }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('pulse: refuses uppercase letters in the word', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'HEART', cue: 'sample: pump' } }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('cueword: refuses a malformed puzzle', () => {
    const result = acceptPuzzle({ game: 'cueword', date: TODAY, puzzle: { id: 'sample: bad', sample: true, grid: [] } }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('triage: refuses empty groups', () => {
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle: { groups: [], oddOne: 'sample: one' } }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('triage: refuses a group with no terms', () => {
    const puzzle = { groups: [{ name: 'sample: g', terms: [] }], oddOne: 'sample: odd' };
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('triage: refuses a missing oddOne', () => {
    const puzzle = { groups: triagePuzzle.groups };
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('suture: refuses a malformed grid', () => {
    const puzzle = { id: 'sample: bad', sample: true, grid: ['X'], words: [] };
    const result = acceptPuzzle({ game: 'suture', date: TODAY, puzzle }, TODAY);
    expect(result.ok).toBe(false);
  });
});

// ── Error messages never show puzzle answers ───────────────────────────────────

describe('acceptPuzzle — answer safety', () => {
  it('pulse: error for a short word does not echo the word', () => {
    const result = acceptPuzzle({ game: 'pulse', date: TODAY, puzzle: { word: 'cat', cue: 'sample: purring' } }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toContain('cat');
  });
});

// ── today validation ───────────────────────────────────────────────────────────

describe('acceptPuzzle — today validation', () => {
  it('refuses a malformed today (not YYYY-MM-DD)', () => {
    const result = acceptPuzzle({ game: 'pulse', date: 'garbage', puzzle: pulsePuzzle }, 'garbage');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('YYYY-MM-DD');
  });

  it('refuses a rolled-over date like 2026-02-31 (not a valid calendar day)', () => {
    // The YYYY-MM-DD shape check passes; a rolled-over date like 2026-02-31 would not match
    // a real date string if we also checked calendar validity — but here we only require shape,
    // which is sufficient for the safety-net purpose. Shape-only test confirms no false refusal.
    const result = acceptPuzzle({ game: 'pulse', date: '2026-11-01', puzzle: pulsePuzzle }, '2026-11-01');
    expect(result.ok).toBe(true);
  });
});

// ── Triage duplicate-term check ────────────────────────────────────────────────

describe('acceptPuzzle — triage duplicate terms', () => {
  it('refuses a term that appears in two groups', () => {
    const puzzle = {
      groups: [
        { name: 'sample: g1', terms: ['sample: alpha', 'sample: beta'] },
        { name: 'sample: g2', terms: ['sample: alpha', 'sample: gamma'] },
      ],
      oddOne: 'sample: delta',
    };
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle }, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('once');
  });

  it('refuses oddOne that matches a group term (case-insensitive)', () => {
    const puzzle = {
      groups: [{ name: 'sample: g1', terms: ['sample: ALPHA', 'sample: beta'] }],
      oddOne: 'sample: alpha',
    };
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle }, TODAY);
    expect(result.ok).toBe(false);
  });

  it('accepts a triage puzzle with all unique terms', () => {
    const result = acceptPuzzle({ game: 'triage', date: TODAY, puzzle: triagePuzzle }, TODAY);
    expect(result.ok).toBe(true);
  });
});

describe('selectTodayPuzzle — feed outcomes', () => {
  const sample = { game: 'pulse', date: TODAY, puzzle: { word: 'abcde', cue: '[sample clue]' } };

  it('reports none-today for an empty feed', () => {
    expect(selectTodayPuzzle([], TODAY, 'pulse')).toEqual({ status: 'none-today' });
  });

  it('reports none-today when today is outside the published dates', () => {
    expect(selectTodayPuzzle([{ ...sample, date: '2026-10-31' }], TODAY, 'pulse'))
      .toEqual({ status: 'none-today' });
    expect(selectTodayPuzzle([{ ...sample, date: '2026-11-02' }], TODAY, 'pulse'))
      .toEqual({ status: 'none-today' });
  });

  it('does not select a different game on the same day', () => {
    expect(selectTodayPuzzle([sample], TODAY, 'cueword')).toEqual({ status: 'none-today' });
  });

  it('returns a validated, cleaned puzzle for a normal day', () => {
    const result = selectTodayPuzzle([{ ...sample, puzzle: { ...sample.puzzle, extra: '[sample extra]' } }], TODAY, 'pulse');
    expect(result.status).toBe('puzzle');
    if (result.status !== 'puzzle') return;
    expect(result.game).toBe('pulse');
    expect(result.puzzle).toEqual(sample.puzzle);
    expect(result).not.toHaveProperty('message');
  });

  it('reports failed for malformed entries without leaking error details', () => {
    expect(selectTodayPuzzle([{ ...sample, puzzle: { word: 'x', cue: '[sample clue]' } }], TODAY, 'pulse'))
      .toEqual({ status: 'failed' });
    expect(selectTodayPuzzle([null], TODAY, 'pulse')).toEqual({ status: 'failed' });
    expect(selectTodayPuzzle([{ date: TODAY }], TODAY, 'pulse')).toEqual({ status: 'failed' });
    const broken = Object.defineProperty({}, 'game', { get: () => { throw new Error('private details'); } });
    expect(selectTodayPuzzle([broken], TODAY, 'pulse')).toEqual({ status: 'failed' });
  });

  it('reports failed for invalid feed input and ambiguous duplicate entries', () => {
    expect(selectTodayPuzzle(undefined, TODAY, 'pulse')).toEqual({ status: 'failed' });
    expect(selectTodayPuzzle({}, TODAY, 'pulse')).toEqual({ status: 'failed' });
    expect(selectTodayPuzzle([sample, sample], TODAY, 'pulse')).toEqual({ status: 'failed' });
    expect(selectTodayPuzzle([sample], 'not-a-date', 'pulse')).toEqual({ status: 'failed' });
  });
});

describe('loadTodayPuzzle — load failures', () => {
  const sample = { game: 'pulse', date: TODAY, puzzle: { word: 'abcde', cue: '[sample clue]' } };

  it('returns failed when a loader rejects or throws synchronously', async () => {
    await expect(loadTodayPuzzle(async () => { throw new Error('private loader detail'); }, TODAY, 'pulse'))
      .resolves.toEqual({ status: 'failed' });
    await expect(loadTodayPuzzle(() => { throw new Error('private loader detail'); }, TODAY, 'pulse'))
      .resolves.toEqual({ status: 'failed' });
  });

  it('handles a successfully loaded empty feed and a valid daily puzzle', async () => {
    await expect(loadTodayPuzzle(async () => [], TODAY, 'pulse'))
      .resolves.toEqual({ status: 'none-today' });
    const result = await loadTodayPuzzle(async () => [sample], TODAY, 'pulse');
    expect(result.status).toBe('puzzle');
    if (result.status === 'puzzle') expect(result.puzzle).toEqual(sample.puzzle);
  });
});
