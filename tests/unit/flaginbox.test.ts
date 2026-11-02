import { describe, expect, it } from 'vitest';
import { groupByItem, inbox, markHandled, type FlagRow } from '../../src/islands/flaginbox';

const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;

const make = (overrides: Partial<FlagRow> = {}): FlagRow => ({
  id: uuid(1),
  user_id: uuid(1000),
  page: '/learn/fluids',
  item_id: null,
  item_version_id: null,
  status: 'open',
  reason: 'typo',
  comment: 'a comment',
  created_at: '2026-11-01T10:00:00Z',
  handled_at: null,
  ...overrides,
});

const open1 = make({ id: uuid(1), page: '/learn/fluids', created_at: '2026-11-01T10:00:00Z' });
const open2 = make({ id: uuid(2), page: '/learn/acids', reason: 'wrong-fact', created_at: '2026-11-01T11:00:00Z' });
const handled1 = make({ id: uuid(3), page: '/learn/fluids', reason: 'broken', created_at: '2026-11-01T09:00:00Z', status: 'handled', handled_at: '2026-11-01T12:00:00Z' });

describe('inbox', () => {
  it('returns all flags when no filter is given, newest first', () => {
    const result = inbox([open1, open2, handled1]);
    expect(result.map((f) => f.id)).toEqual([uuid(2), uuid(1), uuid(3)]);
  });

  it('returns empty array for an empty inbox', () => {
    expect(inbox([])).toEqual([]);
  });

  it('filters to open reports only', () => {
    const result = inbox([open1, open2, handled1], { handled: false });
    expect(result.map((f) => f.id)).toEqual([uuid(2), uuid(1)]);
  });

  it('filters to handled reports only', () => {
    const result = inbox([open1, open2, handled1], { handled: true });
    expect(result.map((f) => f.id)).toEqual([uuid(3)]);
  });

  it('filters by reason', () => {
    const result = inbox([open1, open2, handled1], { reason: 'wrong-fact' });
    expect(result.map((f) => f.id)).toEqual([uuid(2)]);
  });

  it('filters by page (exact match)', () => {
    const result = inbox([open1, open2, handled1], { page: '/learn/fluids' });
    expect(result.map((f) => f.id)).toEqual([uuid(1), uuid(3)]);
  });

  it('combines filters (page + handled)', () => {
    const result = inbox([open1, open2, handled1], { page: '/learn/fluids', handled: false });
    expect(result.map((f) => f.id)).toEqual([uuid(1)]);
  });

  it('returns no results when no reports match', () => {
    expect(inbox([open1, open2], { reason: 'confusing' })).toEqual([]);
  });

  it('sorts correctly when timestamps have mixed fractional-second precision', () => {
    const earlier = make({ id: uuid(5), created_at: '2026-11-01T10:00:00Z' });
    const later = make({ id: uuid(6), created_at: '2026-11-01T10:00:00.100Z' });
    expect(inbox([earlier, later]).map((f) => f.id)).toEqual([uuid(6), uuid(5)]);
  });

  it('sorts correctly when timestamps use offset notation vs Z', () => {
    const a = make({ id: uuid(11), created_at: '2026-11-01T10:00:00+00:00' });
    const b = make({ id: uuid(12), created_at: '2026-11-01T10:00:01Z' });
    expect(inbox([a, b]).map((f) => f.id)).toEqual([uuid(12), uuid(11)]);
  });

  it('does not mutate the input array', () => {
    const arr = [open1, handled1, open2];
    inbox(arr, { handled: false });
    expect(arr.map((f) => f.id)).toEqual([uuid(1), uuid(3), uuid(2)]);
  });

  it('does not mutate input rows (same reference, same content)', () => {
    const flag = make({ id: uuid(24), handled_at: null });
    inbox([flag], { handled: false });
    expect(flag.handled_at).toBeNull();
  });
});

describe('groupByItem', () => {
  const item1v1a = make({ id: uuid(11), item_id: uuid(101), item_version_id: uuid(201), handled_at: null });
  const item1v1b = make({ id: uuid(12), item_id: uuid(101), item_version_id: uuid(201), status: 'handled', handled_at: '2026-11-01T12:00:00Z' });
  const item1v2 = make({ id: uuid(13), item_id: uuid(101), item_version_id: uuid(202), handled_at: null });
  const item2v1 = make({ id: uuid(14), item_id: uuid(102), item_version_id: uuid(203), handled_at: null });
  const noItem = make({ id: uuid(5), item_id: null, item_version_id: null, handled_at: null });

  it('groups by (item_id, item_version_id)', () => {
    const groups = groupByItem([item1v1a, item1v1b, item1v2, item2v1]);
    expect(groups.length).toBe(3);
    expect(groups[0]!.item_id).toBe(uuid(101));
    expect(groups[0]!.item_version_id).toBe(uuid(201));
    expect(groups[0]!.flags.map((f) => f.id)).toEqual([uuid(11), uuid(12)]);
  });

  it('returns a summary with report count and not-handled count', () => {
    const [g] = groupByItem([item1v1a, item1v1b]);
    expect(g!.summary).toBe('2 reports, 1 not handled');
  });

  it('uses singular for exactly one report or one not handled', () => {
    const [g] = groupByItem([item1v1a]);
    expect(g!.summary).toBe('1 report, 1 not handled');
    const [h] = groupByItem([make({ item_id: uuid(101), item_version_id: uuid(201), status: 'handled', handled_at: '2026-01-01T00:00:00Z' })]);
    expect(h!.summary).toBe('1 report, 0 not handled');
  });

  it('counts all as not handled when none are handled', () => {
    const [g] = groupByItem([item1v1a, item1v2]);
    expect(g!.summary).toBe('1 report, 1 not handled');
  });

  it('handles flags with no item', () => {
    const groups = groupByItem([noItem, item1v1a]);
    expect(groups[0]).toMatchObject({ item_id: null, item_version_id: null, flags: [noItem] });
  });

  it('keeps a removed version separate from the same item with an existing UUID version', () => {
    const removed = make({ item_id: uuid(101), item_version_id: null, comment: null });
    const groups = groupByItem([removed, item1v1a]);
    expect(groups.map(group => group.item_version_id)).toEqual([null, uuid(201)]);
    expect(groups[0]!.flags).toEqual([removed]);
    expect(groups[1]!.flags).toEqual([item1v1a]);
    expect(groups[0]).not.toHaveProperty('item_version');
  });

  it('returns an empty array for an empty inbox', () => {
    expect(groupByItem([])).toEqual([]);
  });

  it('preserves insertion order of first appearance', () => {
    const groups = groupByItem([item2v1, item1v1a]);
    expect(groups[0]!.item_id).toBe(uuid(102));
    expect(groups[1]!.item_id).toBe(uuid(101));
  });
});

describe('markHandled', () => {
  it('returns a new row with handled_at set', () => {
    const flag = make({ id: uuid(24), handled_at: null });
    const result = markHandled(flag, '2026-11-01T13:00:00Z');
    expect(result.handled_at).toBe('2026-11-01T13:00:00Z');
    expect(result.status).toBe('handled');
    expect(result.id).toBe(uuid(24));
  });

  it('does not mutate the input', () => {
    const flag = make({ handled_at: null });
    markHandled(flag, '2026-11-01T13:00:00Z');
    expect(flag.handled_at).toBeNull();
    expect(flag.status).toBe('open');
  });

  it('returns a different object reference', () => {
    const flag = make();
    expect(markHandled(flag, '2026-11-01T13:00:00Z')).not.toBe(flag);
  });

  it('moves a real stored row into the handled inbox and updates its group without changing other columns', () => {
    const flag = Object.freeze(make({ item_id: uuid(101), item_version_id: uuid(201), comment: null }));
    const result = markHandled(flag, '2026-11-01T13:00:00Z');
    expect(result).toEqual({ ...flag, status: 'handled', handled_at: '2026-11-01T13:00:00Z' });
    expect(inbox([result], { handled: true })).toEqual([result]);
    expect(inbox([result], { handled: false })).toEqual([]);
    expect(groupByItem([result])[0]!.summary).toBe('1 report, 0 not handled');
    expect(flag.status).toBe('open');
    expect(flag.handled_at).toBeNull();
  });
});

describe('comment safety', () => {
  it('keeps a comment containing <script> as plain text, never HTML', () => {
    const flag = make({ comment: '<script>alert(1)</script>' });
    const [result] = inbox([flag]);
    expect(result!.comment).toBe('<script>alert(1)</script>');
  });

  it('a group summary with a scripted comment still uses the raw string', () => {
    const flag = make({ item_id: uuid(101), item_version_id: uuid(201), comment: '<script>alert(1)</script>' });
    const [group] = groupByItem([flag]);
    const found = group!.flags[0]!.comment;
    expect(found).toBe('<script>alert(1)</script>');
  });
});
