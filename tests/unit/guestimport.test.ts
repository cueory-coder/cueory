import { describe, expect, it } from 'vitest';
import { importRows } from '../../src/islands/guestimport';
import { emptyProgress } from '../../src/scripts/progress';
import type { Progress } from '../../src/scripts/progress';

const TODAY = '2026-11-01';
const YESTERDAY = '2026-10-31';
const NEXT_KNOWN = '2026-11-04'; // today + 3 (STEPS[1])

// ── helpers ───────────────────────────────────────────────────────────────────

function knownSet(...ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

function progressWith(decks: Progress['decks']): Progress {
  return { ...emptyProgress(), decks };
}

// ── empty progress ────────────────────────────────────────────────────────────

describe('empty progress', () => {
  it('returns empty rows and skipped', () => {
    const { rows, skipped } = importRows(emptyProgress(), new Set(), TODAY);
    expect(rows).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });

  it('returns empty rows when knownIds is empty but decks have cards', () => {
    const progress = progressWith({ deck1: { know: ['card-a'], learning: [], starred: [] } });
    const { rows, skipped } = importRows(progress, new Set(), TODAY);
    expect(rows).toHaveLength(0);
    expect(skipped).toEqual(['card-a']);
  });
});

// ── mixed deck ────────────────────────────────────────────────────────────────

describe('mixed deck', () => {
  const progress = progressWith({
    deck1: { know: ['card-know'], learning: ['card-learn'], starred: ['card-know'] },
  });
  const known = knownSet('card-know', 'card-learn');

  it('returns two rows', () => {
    const { rows } = importRows(progress, known, TODAY);
    expect(rows).toHaveLength(2);
  });

  it('"know" card: level 1, last_reviewed today, next_review today+3', () => {
    const { rows } = importRows(progress, known, TODAY);
    const row = rows.find((r) => r.item_id === 'card-know');
    expect(row).toBeDefined();
    expect(row!.level).toBe(1);
    expect(row!.last_reviewed).toBe(TODAY);
    expect(row!.next_review).toBe(NEXT_KNOWN);
  });

  it('"learning" card: level 0, last_reviewed yesterday, next_review today', () => {
    const { rows } = importRows(progress, known, TODAY);
    const row = rows.find((r) => r.item_id === 'card-learn');
    expect(row).toBeDefined();
    expect(row!.level).toBe(0);
    expect(row!.last_reviewed).toBe(YESTERDAY);
    expect(row!.next_review).toBe(TODAY);
  });

  it('next_review > last_reviewed for all rows (migration constraint)', () => {
    const { rows } = importRows(progress, known, TODAY);
    for (const row of rows) {
      expect(row.next_review > row.last_reviewed).toBe(true);
    }
  });

  it('star flag is true on the "know" card', () => {
    const { rows } = importRows(progress, known, TODAY);
    const row = rows.find((r) => r.item_id === 'card-know');
    expect(row!.starred).toBe(true);
  });

  it('star flag is false on the unstarred "learning" card', () => {
    const { rows } = importRows(progress, known, TODAY);
    const row = rows.find((r) => r.item_id === 'card-learn');
    expect(row!.starred).toBe(false);
  });

  it('skipped is empty when all ids are known', () => {
    const { skipped } = importRows(progress, known, TODAY);
    expect(skipped).toHaveLength(0);
  });
});

// ── unknown card ids ──────────────────────────────────────────────────────────

describe('unknown card ids', () => {
  it('cards not in knownIds go into skipped, not rows', () => {
    const progress = progressWith({
      deck1: { know: ['card-a', 'card-b'], learning: ['card-c'], starred: [] },
    });
    const { rows, skipped } = importRows(progress, knownSet('card-a'), TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.item_id).toBe('card-a');
    expect(skipped).toContain('card-b');
    expect(skipped).toContain('card-c');
  });

  it('unknown starred-only cards also land in skipped', () => {
    const progress = progressWith({
      deck1: { know: [], learning: [], starred: ['card-s'] },
    });
    const { rows, skipped } = importRows(progress, new Set(), TODAY);
    expect(rows).toHaveLength(0);
    expect(skipped).toContain('card-s');
  });
});

// ── starred-only cards ────────────────────────────────────────────────────────

describe('starred-only cards', () => {
  it('a card in starred but neither pile gets a row due today (level 0)', () => {
    const progress = progressWith({
      deck1: { know: [], learning: [], starred: ['card-star'] },
    });
    const { rows, skipped } = importRows(progress, knownSet('card-star'), TODAY);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    const row = rows[0]!;
    expect(row.item_id).toBe('card-star');
    expect(row.level).toBe(0);
    expect(row.last_reviewed).toBe(YESTERDAY);
    expect(row.next_review).toBe(TODAY);
    expect(row.starred).toBe(true);
  });

  it('a card in know AND starred is not duplicated', () => {
    const progress = progressWith({
      deck1: { know: ['card-x'], learning: [], starred: ['card-x'] },
    });
    const { rows } = importRows(progress, knownSet('card-x'), TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.level).toBe(1);
    expect(rows[0]!.starred).toBe(true);
  });

  it('a card in learning AND starred is not duplicated', () => {
    const progress = progressWith({
      deck1: { know: [], learning: ['card-y'], starred: ['card-y'] },
    });
    const { rows } = importRows(progress, knownSet('card-y'), TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.level).toBe(0);
    expect(rows[0]!.starred).toBe(true);
  });
});

// ── pinned today ──────────────────────────────────────────────────────────────

describe('pinned today', () => {
  const progress = progressWith({
    deck1: { know: ['c-know'], learning: ['c-learn'], starred: ['c-star'] },
  });
  const known = knownSet('c-know', 'c-learn', 'c-star');

  it('know: next_review is pinned_today + 3', () => {
    const { rows } = importRows(progress, known, '2024-03-15');
    const row = rows.find((r) => r.item_id === 'c-know');
    expect(row!.last_reviewed).toBe('2024-03-15');
    expect(row!.next_review).toBe('2024-03-18');
  });

  it('learning: next_review equals pinned today, last is yesterday', () => {
    const { rows } = importRows(progress, known, '2024-03-15');
    const row = rows.find((r) => r.item_id === 'c-learn');
    expect(row!.last_reviewed).toBe('2024-03-14');
    expect(row!.next_review).toBe('2024-03-15');
  });

  it('correctly crosses a month boundary', () => {
    const { rows } = importRows(
      progressWith({ d: { know: ['x'], learning: [], starred: [] } }),
      knownSet('x'),
      '2024-01-30',
    );
    expect(rows[0]!.next_review).toBe('2024-02-02');
  });

  it('correctly crosses a year boundary', () => {
    const { rows } = importRows(
      progressWith({ d: { know: ['x'], learning: [], starred: [] } }),
      knownSet('x'),
      '2024-12-30',
    );
    expect(rows[0]!.next_review).toBe('2025-01-02');
  });
});

// ── row shape ─────────────────────────────────────────────────────────────────

describe('row shape', () => {
  it('each row has exactly the five expected fields', () => {
    const progress = progressWith({ d: { know: ['c'], learning: [], starred: [] } });
    const { rows } = importRows(progress, knownSet('c'), TODAY);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'item_id', 'last_reviewed', 'level', 'next_review', 'starred',
    ]);
  });
});
