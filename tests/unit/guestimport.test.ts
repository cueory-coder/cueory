import { describe, expect, it } from 'vitest';
import { importRows } from '../../src/islands/guestimport';
import type { IdMap } from '../../src/islands/guestimport';
import { emptyProgress, withPile, withStars } from '../../src/scripts/progress';
import type { Progress } from '../../src/scripts/progress';

const TODAY = '2026-11-01';
const YESTERDAY = '2026-10-31';
const NEXT_KNOWN = '2026-11-04'; // today + 3 (nextReview after one 'knew')

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build an IdMap: { deckId: { cardId: uuid, ... }, ... } */
function makeIdMap(decks: Record<string, Record<string, string>>): IdMap {
  return new Map(
    Object.entries(decks).map(([deckId, cards]) => [deckId, new Map(Object.entries(cards))]),
  );
}

function progressWith(decks: Progress['decks']): Progress {
  return { ...emptyProgress(), decks };
}

// ── empty progress ────────────────────────────────────────────────────────────

describe('empty progress', () => {
  it('returns empty rows, starred and skipped', () => {
    const result = importRows(emptyProgress(), new Map(), TODAY);
    expect(result.rows).toHaveLength(0);
    expect(result.starred).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('returns empty rows when idMap is empty but decks have cards', () => {
    const progress = progressWith({ deck1: { know: ['card-a'], learning: [], starred: [] } });
    const result = importRows(progress, new Map(), TODAY);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toContain('deck1/card-a');
  });
});

// ── mixed deck ────────────────────────────────────────────────────────────────

describe('mixed deck', () => {
  const progress = progressWith({
    deck1: { know: ['card-know'], learning: ['card-learn'], starred: ['card-know'] },
  });
  const map = makeIdMap({ deck1: { 'card-know': 'uuid-know', 'card-learn': 'uuid-learn' } });

  it('returns two rows', () => {
    expect(importRows(progress, map, TODAY).rows).toHaveLength(2);
  });

  it('"know" row: level 1, last_reviewed today, next_review today+3', () => {
    const row = importRows(progress, map, TODAY).rows.find(r => r.item_id === 'uuid-know');
    expect(row).toBeDefined();
    expect(row!.level).toBe(1);
    expect(row!.last_reviewed).toBe(TODAY);
    expect(row!.next_review).toBe(NEXT_KNOWN);
  });

  it('"learning" row: level 0, last_reviewed yesterday, next_review today', () => {
    const row = importRows(progress, map, TODAY).rows.find(r => r.item_id === 'uuid-learn');
    expect(row).toBeDefined();
    expect(row!.level).toBe(0);
    expect(row!.last_reviewed).toBe(YESTERDAY);
    expect(row!.next_review).toBe(TODAY);
  });

  it('next_review > last_reviewed for all rows (migration constraint)', () => {
    for (const row of importRows(progress, map, TODAY).rows) {
      expect(row.next_review > row.last_reviewed).toBe(true);
    }
  });

  it('starred uuid appears in starred list', () => {
    const result = importRows(progress, map, TODAY);
    expect(result.starred).toContain('uuid-know');
    expect(result.starred).not.toContain('uuid-learn');
  });

  it('skipped is empty when all ids are mapped', () => {
    expect(importRows(progress, map, TODAY).skipped).toHaveLength(0);
  });
});

// ── unknown card ids ──────────────────────────────────────────────────────────

describe('unknown card ids', () => {
  it('cards not in idMap go into skipped as "deckId/cardId"', () => {
    const progress = progressWith({
      deck1: { know: ['card-a', 'card-b'], learning: ['card-c'], starred: [] },
    });
    const result = importRows(progress, makeIdMap({ deck1: { 'card-a': 'uuid-a' } }), TODAY);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.item_id).toBe('uuid-a');
    expect(result.skipped).toContain('deck1/card-b');
    expect(result.skipped).toContain('deck1/card-c');
  });

  it('unknown starred-only cards also land in skipped', () => {
    const progress = progressWith({ deck1: { know: [], learning: [], starred: ['card-s'] } });
    const result = importRows(progress, new Map(), TODAY);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toContain('deck1/card-s');
  });
});

// ── starred-only cards ────────────────────────────────────────────────────────

describe('starred-only cards', () => {
  it('a card in starred but neither pile gets a level-0 row due today', () => {
    const progress = progressWith({ deck1: { know: [], learning: [], starred: ['card-star'] } });
    const result = importRows(progress, makeIdMap({ deck1: { 'card-star': 'uuid-star' } }), TODAY);
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    const row = result.rows[0]!;
    expect(row.item_id).toBe('uuid-star');
    expect(row.level).toBe(0);
    expect(row.last_reviewed).toBe(YESTERDAY);
    expect(row.next_review).toBe(TODAY);
    expect(result.starred).toContain('uuid-star');
  });

  it('a card in know AND starred is not duplicated; appears in starred list', () => {
    const progress = progressWith({ deck1: { know: ['card-x'], learning: [], starred: ['card-x'] } });
    const result = importRows(progress, makeIdMap({ deck1: { 'card-x': 'uuid-x' } }), TODAY);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.level).toBe(1);
    expect(result.starred).toContain('uuid-x');
  });

  it('a card in learning AND starred is not duplicated; appears in starred list', () => {
    const progress = progressWith({ deck1: { know: [], learning: ['card-y'], starred: ['card-y'] } });
    const result = importRows(progress, makeIdMap({ deck1: { 'card-y': 'uuid-y' } }), TODAY);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.level).toBe(0);
    expect(result.starred).toContain('uuid-y');
  });
});

// ── cross-deck: deck-local card ids ──────────────────────────────────────────

describe('cross-deck deduplication', () => {
  it('the same local card id in two decks maps to different uuids → two rows', () => {
    let progress = emptyProgress();
    progress = withPile(progress, 'deck-a', 'card-x', 'know');
    progress = withPile(progress, 'deck-b', 'card-x', 'learning');
    const result = importRows(
      progress,
      makeIdMap({ 'deck-a': { 'card-x': 'uuid-A' }, 'deck-b': { 'card-x': 'uuid-B' } }),
      TODAY,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map(r => r.item_id).sort()).toEqual(['uuid-A', 'uuid-B']);
  });

  it('the same uuid in two decks (same physical card) produces one row at the higher level', () => {
    let progress = emptyProgress();
    progress = withPile(progress, 'deck-a', 'card-x', 'learning');
    progress = withPile(progress, 'deck-b', 'card-y', 'know');
    const result = importRows(
      progress,
      makeIdMap({ 'deck-a': { 'card-x': 'uuid-shared' }, 'deck-b': { 'card-y': 'uuid-shared' } }),
      TODAY,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.level).toBe(1); // know wins over learning
  });
});

// ── invalid shapes ────────────────────────────────────────────────────────────

describe('invalid deck shapes (graceful fallback)', () => {
  it('non-array pile is treated as empty', () => {
    const progress = progressWith({
      deck1: { know: 'not-an-array' as unknown as string[], learning: [], starred: [] },
    });
    const result = importRows(progress, new Map(), TODAY);
    expect(result.rows).toHaveLength(0);
  });

  it('null starred is treated as empty', () => {
    const progress = progressWith({
      deck1: { know: ['card-a'], learning: [], starred: null as unknown as string[] },
    });
    const result = importRows(progress, makeIdMap({ deck1: { 'card-a': 'uuid-a' } }), TODAY);
    expect(result.rows).toHaveLength(1);
    expect(result.starred).toHaveLength(0);
  });
});

// ── today validation ──────────────────────────────────────────────────────────

describe('today validation', () => {
  it('throws on garbage today', () => {
    expect(() => importRows(emptyProgress(), new Map(), 'garbage')).toThrow();
  });

  it('throws on a rolled-over date like 2026-02-31', () => {
    expect(() => importRows(emptyProgress(), new Map(), '2026-02-31')).toThrow();
  });

  it('accepts a valid date without throwing', () => {
    expect(() => importRows(emptyProgress(), new Map(), TODAY)).not.toThrow();
  });
});

// ── pinned today ──────────────────────────────────────────────────────────────

describe('pinned today', () => {
  const progress = progressWith({
    deck1: { know: ['c-know'], learning: ['c-learn'], starred: ['c-star'] },
  });
  const map = makeIdMap({ deck1: { 'c-know': 'u-know', 'c-learn': 'u-learn', 'c-star': 'u-star' } });

  it('know: next_review is pinned_today + 3', () => {
    const row = importRows(progress, map, '2024-03-15').rows.find(r => r.item_id === 'u-know');
    expect(row!.last_reviewed).toBe('2024-03-15');
    expect(row!.next_review).toBe('2024-03-18');
  });

  it('learning: next_review equals pinned today', () => {
    const row = importRows(progress, map, '2024-03-15').rows.find(r => r.item_id === 'u-learn');
    expect(row!.last_reviewed).toBe('2024-03-14');
    expect(row!.next_review).toBe('2024-03-15');
  });

  it('correctly crosses a month boundary', () => {
    const p = progressWith({ d: { know: ['x'], learning: [], starred: [] } });
    const row = importRows(p, makeIdMap({ d: { x: 'u' } }), '2024-01-30').rows[0]!;
    expect(row.next_review).toBe('2024-02-02');
  });

  it('correctly crosses a year boundary', () => {
    const p = progressWith({ d: { know: ['x'], learning: [], starred: [] } });
    const row = importRows(p, makeIdMap({ d: { x: 'u' } }), '2024-12-30').rows[0]!;
    expect(row.next_review).toBe('2025-01-02');
  });
});

// ── row shape ─────────────────────────────────────────────────────────────────

describe('row shape', () => {
  it('each row has exactly the four database columns', () => {
    const progress = progressWith({ d: { know: ['c'], learning: [], starred: [] } });
    const { rows } = importRows(progress, makeIdMap({ d: { c: 'uuid-c' } }), TODAY);
    expect(Object.keys(rows[0]!).sort()).toEqual(['item_id', 'last_reviewed', 'level', 'next_review']);
  });

  it('rows contain uuids from idMap, not card slugs', () => {
    const progress = progressWith({ d: { know: ['my-card'], learning: [], starred: [] } });
    const { rows } = importRows(
      progress,
      makeIdMap({ d: { 'my-card': '550e8400-e29b-41d4-a716-446655440000' } }),
      TODAY,
    );
    expect(rows[0]!.item_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
});

// ── real withPile helper (regression from Codex review) ──────────────────────

describe('real progress helpers', () => {
  it('withPile across two decks produces correct rows without silent drops', () => {
    let progress = emptyProgress();
    progress = withPile(progress, 'sample-a', 'sample-card', 'know');
    progress = withPile(progress, 'sample-b', 'sample-card', 'learning');
    const result = importRows(
      progress,
      makeIdMap({ 'sample-a': { 'sample-card': 'uuid-sa' }, 'sample-b': { 'sample-card': 'uuid-sb' } }),
      TODAY,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('withStars puts starred uuid in starred list', () => {
    let progress = emptyProgress();
    progress = withPile(progress, 'deck1', 'card-a', 'know');
    progress = withStars(progress, 'deck1', ['card-a']);
    const result = importRows(progress, makeIdMap({ deck1: { 'card-a': 'uuid-a' } }), TODAY);
    expect(result.starred).toContain('uuid-a');
  });
});
