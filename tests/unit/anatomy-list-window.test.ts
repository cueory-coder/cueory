import { describe, expect, it } from 'vitest';
import { STRUCTURE_PAGE_SIZE, visibleStructureGroups } from '../../src/islands/anatomy-list-window';
import type { StructureGroup } from '../../src/islands/anatomylab';

const item = (id: string) => ({ id, text: `fixture ${id}` });
const groups: StructureGroup[] = [
  { group: 'first', items: [item('a'), item('b')] },
  { group: 'empty', items: [] },
  { group: null, items: [item('c'), item('d'), item('e')] },
  { group: 'last', items: [item('f')] },
];

describe('anatomy structure list window', () => {
  it('uses a fixed page size to bound the initial list', () => {
    expect(STRUCTURE_PAGE_SIZE).toBe(40);
    const large: StructureGroup[] = [{ group: 'fake group', items: Array.from({ length: 1255 }, (_, i) => item(String(i))) }];
    const first = visibleStructureGroups(large, STRUCTURE_PAGE_SIZE);
    expect(first[0]!.items).toHaveLength(40);
    expect(first[0]!.items[39]!.id).toBe('39');
    expect(visibleStructureGroups(large, 80)[0]!.items[79]!.id).toBe('79');
  });

  it('keeps group and item order across a page boundary', () => {
    expect(visibleStructureGroups(groups, 3)).toEqual([
      { group: 'first', items: [item('a'), item('b')] },
      { group: null, items: [item('c')] },
    ]);
    expect(visibleStructureGroups(groups, 5)).toEqual([
      { group: 'first', items: [item('a'), item('b')] },
      { group: null, items: [item('c'), item('d'), item('e')] },
    ]);
    expect(visibleStructureGroups(groups, 100).map((group) => group.group)).toEqual(['first', null, 'last']);
  });

  it('does not modify or reorder source groups or their arrays', () => {
    const before = JSON.stringify(groups);
    const first = visibleStructureGroups(groups, 3);
    first[0]!.items.pop();
    expect(JSON.stringify(groups)).toBe(before);
  });

  it('returns no structures for zero, negative, nonfinite, or subunit limits', () => {
    for (const limit of [0, -1, NaN, Infinity, 0.5]) {
      expect(visibleStructureGroups(groups, limit)).toEqual([]);
    }
  });
});
