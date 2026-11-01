import { describe, expect, it } from 'vitest';
import { dueItems, syntheticHistory, type ReviewStateRow } from '../../src/islands/reviewqueue';
import { nextReview } from '../../src/islands/review';

function row(item_id: string, overrides: Partial<ReviewStateRow> = {}): ReviewStateRow {
  return {
    item_id,
    level: 1,
    last_reviewed: '2026-10-25',
    next_review: '2026-10-28',
    ...overrides,
  };
}

// ── dueItems ──────────────────────────────────────────────────────────────────

describe('dueItems', () => {
  it('returns empty list when no rows', () => {
    expect(dueItems([], '2026-11-01')).toEqual([]);
  });

  it('includes items whose next_review equals today', () => {
    const rows = [row('a', { next_review: '2026-11-01' })];
    expect(dueItems(rows, '2026-11-01')).toEqual(['a']);
  });

  it('includes items whose next_review is before today', () => {
    const rows = [row('a', { next_review: '2026-10-28' })];
    expect(dueItems(rows, '2026-11-01')).toEqual(['a']);
  });

  it('excludes items whose next_review is after today', () => {
    const rows = [row('a', { next_review: '2026-11-05' })];
    expect(dueItems(rows, '2026-11-01')).toEqual([]);
  });

  it('returns only due items from a mixed list', () => {
    const rows = [
      row('a', { next_review: '2026-10-28' }),
      row('b', { next_review: '2026-11-01' }),
      row('c', { next_review: '2026-11-02' }),
    ];
    expect(dueItems(rows, '2026-11-01')).toEqual(['a', 'b']);
  });

  it('sorts by next_review ascending', () => {
    const rows = [
      row('a', { next_review: '2026-11-01' }),
      row('b', { last_reviewed: '2026-10-10', next_review: '2026-10-15' }),
      row('c', { next_review: '2026-10-28' }),
    ];
    expect(dueItems(rows, '2026-11-01')).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by item_id', () => {
    const rows = [
      row('z', { next_review: '2026-10-28' }),
      row('a', { next_review: '2026-10-28' }),
      row('m', { next_review: '2026-10-28' }),
    ];
    expect(dueItems(rows, '2026-11-01')).toEqual(['a', 'm', 'z']);
  });

  it('handles all items due and sorts them', () => {
    const rows = [
      row('c', { last_reviewed: '2026-10-20', next_review: '2026-10-27' }),
      row('a', { last_reviewed: '2026-10-22', next_review: '2026-10-25' }),
      row('b', { last_reviewed: '2026-10-21', next_review: '2026-10-28' }),
    ];
    expect(dueItems(rows, '2026-11-01')).toEqual(['a', 'c', 'b']);
  });

  it('handles a single item exactly on today', () => {
    expect(dueItems([row('x', { next_review: '2026-11-01' })], '2026-11-01')).toEqual(['x']);
  });

  it('returns empty when all items are not yet due', () => {
    const rows = [
      row('a', { next_review: '2026-11-05' }),
      row('b', { next_review: '2026-11-10' }),
    ];
    expect(dueItems(rows, '2026-11-01')).toEqual([]);
  });
});

// ── dueItems input validation ──────────────────────────────────────────────────

describe('dueItems — validation', () => {
  it('throws for a non-array rows argument', () => {
    // @ts-expect-error intentional
    expect(() => dueItems(null, '2026-11-01')).toThrow();
  });

  it('throws for an invalid today format', () => {
    expect(() => dueItems([], 'not-a-date')).toThrow();
  });

  it('throws for an impossible today date', () => {
    expect(() => dueItems([], '2026-02-30')).toThrow();
  });

  it('throws for an empty item_id', () => {
    expect(() => dueItems([row('', { next_review: '2026-11-01' })], '2026-11-01')).toThrow();
  });

  it('throws for an invalid level', () => {
    // @ts-expect-error intentional
    expect(() => dueItems([row('a', { level: 5 })], '2026-11-01')).toThrow();
  });

  it('throws for an invalid last_reviewed', () => {
    expect(() => dueItems([row('a', { last_reviewed: '2026-13-01' })], '2026-11-01')).toThrow();
  });

  it('throws for an invalid next_review', () => {
    expect(() => dueItems([row('a', { next_review: 'bad-date' })], '2026-11-01')).toThrow();
  });

  it('throws when next_review is not after last_reviewed', () => {
    expect(() => dueItems([row('a', { last_reviewed: '2026-10-28', next_review: '2026-10-28' })], '2026-11-01')).toThrow();
  });

  it('throws for duplicate item_ids', () => {
    expect(() => dueItems([row('a'), row('a')], '2026-11-01')).toThrow();
  });
});

// ── syntheticHistory ──────────────────────────────────────────────────────────

describe('syntheticHistory', () => {
  it('level 0 → one missed on last_reviewed', () => {
    const h = syntheticHistory(row('a', { level: 0, last_reviewed: '2026-10-25' }));
    expect(h).toEqual([{ day: '2026-10-25', result: 'missed' }]);
  });

  it('level 1 → one knew on last_reviewed', () => {
    const h = syntheticHistory(row('a', { level: 1, last_reviewed: '2026-10-25' }));
    expect(h).toEqual([{ day: '2026-10-25', result: 'knew' }]);
  });

  it('level 2 → two knew on last_reviewed', () => {
    const h = syntheticHistory(row('a', { level: 2, last_reviewed: '2026-10-25', next_review: '2026-11-01' }));
    expect(h.length).toBe(2);
    expect(h.every((r) => r.result === 'knew' && r.day === '2026-10-25')).toBe(true);
  });

  it('level 3 → three knew on last_reviewed', () => {
    const h = syntheticHistory(row('a', { level: 3, last_reviewed: '2026-10-25', next_review: '2026-11-08' }));
    expect(h.length).toBe(3);
    expect(h.every((r) => r.result === 'knew')).toBe(true);
  });

  it('nextReview(syntheticHistory) matches STEPS[level] from last_reviewed', () => {
    const steps = [1, 3, 7, 14] as const;
    for (const level of [0, 1, 2, 3] as const) {
      const last = '2026-10-25';
      const next = `2026-10-${25 + steps[level]}`.replace(/(\d{4}-\d{2}-)(\d+)/, (_, prefix, d) => {
        const date = new Date(`${last}T00:00:00.000Z`);
        date.setUTCDate(date.getUTCDate() + steps[level]);
        return date.toISOString().slice(0, 10);
      });
      const h = syntheticHistory(row('a', { level, last_reviewed: last, next_review: next }));
      expect(nextReview(h)).toBe(next);
    }
  });

  it('throws for invalid row', () => {
    // @ts-expect-error intentional
    expect(() => syntheticHistory(null)).toThrow();
  });
});
