import { describe, expect, it } from 'vitest';
import { deletionSummary, confirmState, afterDeletion, type ExportData } from '../../src/islands/deleteaccount';
import { PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import { PROMO_STORAGE_KEY } from '../../src/scripts/promo';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { STATS_STORAGE_KEY } from '../../src/islands/gameresults';

// ── deletionSummary ───────────────────────────────────────────────────────────

describe('deletionSummary with an empty account', () => {
  it('returns an empty array', () => {
    expect(deletionSummary({})).toEqual([]);
  });

  it('ignores a profile with no display name', () => {
    const data: ExportData = { profile: { displayName: null } };
    expect(deletionSummary(data)).toEqual([]);
  });

  it('ignores onboarding with all null fields', () => {
    const data: ExportData = { onboarding: { course: null, examDate: null, school: null } };
    expect(deletionSummary(data)).toEqual([]);
  });

  it('ignores empty progress and gameStats arrays', () => {
    const data: ExportData = { progress: [], reviewState: [], gameStats: [] };
    expect(deletionSummary(data)).toEqual([]);
  });
});

describe('deletionSummary with a full account', () => {
  const fullData: ExportData = {
    profile: { displayName: 'Alex' },
    onboarding: { course: 'med-surg', examDate: '2027-06-01', done: false, school: 'State U' },
    progress: [
      { id: 'card-1', result: true, date: '2026-11-01' },
      { id: 'card-2', result: false, date: '2026-11-01' },
    ],
    reviewState: [
      { id: 'card-1', nextDueDate: '2026-11-08', interval: 7 },
    ],
    gameStats: [
      { game: 'pulse', day: '2026-11-01', solved: true, tries: 3 },
      { game: 'cueword', day: '2026-11-01', solved: false, tries: 6 },
    ],
  };

  it('includes a line for the display name', () => {
    expect(deletionSummary(fullData)).toContain('your display name');
  });

  it('includes a line for study setup', () => {
    expect(deletionSummary(fullData)).toContain('your study setup');
  });

  it('includes a plural card progress line', () => {
    const lines = deletionSummary(fullData);
    expect(lines.some((l) => l.includes('progress'))).toBe(true);
    expect(lines.some((l) => l.includes('2'))).toBe(true);
  });

  it('includes a singular review schedule line for one item', () => {
    const lines = deletionSummary({ reviewState: [{ id: 'c', nextDueDate: '2026-11-08', interval: 7 }] });
    expect(lines.some((l) => l.includes('review schedule') && !l.includes('schedules'))).toBe(true);
  });

  it('includes a plural game results line', () => {
    const lines = deletionSummary(fullData);
    expect(lines.some((l) => l.includes('game result'))).toBe(true);
    expect(lines.some((l) => l.includes('2'))).toBe(true);
  });

  it('returns exactly five lines for a fully-populated account', () => {
    expect(deletionSummary(fullData)).toHaveLength(5);
  });
});

describe('deletionSummary singular vs plural', () => {
  it('uses singular for one card progress entry', () => {
    const data: ExportData = { progress: [{ id: 'c', result: true, date: '2026-11-01' }] };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l.startsWith("1 card's"))).toBe(true);
  });

  it('uses plural for two card progress entries', () => {
    const data: ExportData = {
      progress: [
        { id: 'c1', result: true, date: '2026-11-01' },
        { id: 'c2', result: false, date: '2026-11-01' },
      ],
    };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l.startsWith("2 cards'"))).toBe(true);
  });

  it('uses singular for one game result', () => {
    const data: ExportData = { gameStats: [{ game: 'pulse', day: '2026-11-01', solved: true, tries: 3 }] };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l === '1 game result')).toBe(true);
  });

  it('uses plural review schedules for two entries', () => {
    const data: ExportData = {
      reviewState: [
        { id: 'c1', nextDueDate: '2026-11-08', interval: 7 },
        { id: 'c2', nextDueDate: '2026-11-09', interval: 7 },
      ],
    };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l.includes('2 review schedules'))).toBe(true);
  });
});

// ── confirmState ──────────────────────────────────────────────────────────────

describe('confirmState', () => {
  it('returns null for "delete"', () => {
    expect(confirmState('delete')).toBeNull();
  });

  it('returns null for "DELETE" (any case)', () => {
    expect(confirmState('DELETE')).toBeNull();
  });

  it('returns null for "Delete" (mixed case)', () => {
    expect(confirmState('Delete')).toBeNull();
  });

  it('returns null for " delete " (leading/trailing whitespace)', () => {
    expect(confirmState(' delete ')).toBeNull();
  });

  it('returns a reason for an empty string', () => {
    expect(confirmState('')).not.toBeNull();
  });

  it('returns a reason for whitespace only', () => {
    expect(confirmState('   ')).not.toBeNull();
  });

  it('returns a reason for a near-miss: "delet"', () => {
    expect(confirmState('delet')).not.toBeNull();
  });

  it('returns a reason for "deleted"', () => {
    expect(confirmState('deleted')).not.toBeNull();
  });

  it('returns a reason for "yes"', () => {
    expect(confirmState('yes')).not.toBeNull();
  });

  it('returns a reason for "confirm"', () => {
    expect(confirmState('confirm')).not.toBeNull();
  });

  it('returns a plain lowercase reason (no exclamation marks)', () => {
    const reason = confirmState('wrong');
    expect(reason).not.toBeNull();
    expect(reason).not.toContain('!');
  });
});

// ── afterDeletion ─────────────────────────────────────────────────────────────

describe('afterDeletion', () => {
  it('returns an array of strings', () => {
    const keys = afterDeletion();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
  });

  it('includes the progress storage key', () => {
    expect(afterDeletion()).toContain(PROGRESS_STORAGE_KEY);
  });

  it('includes the promo storage key', () => {
    expect(afterDeletion()).toContain(PROMO_STORAGE_KEY);
  });

  it('includes the theme storage key', () => {
    expect(afterDeletion()).toContain(THEME_STORAGE_KEY);
  });

  it('includes the game stats storage key', () => {
    expect(afterDeletion()).toContain(STATS_STORAGE_KEY);
  });

  it('has no duplicates', () => {
    const keys = afterDeletion();
    expect(new Set(keys).size).toBe(keys.length);
  });
});
