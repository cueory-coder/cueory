import { describe, expect, it } from 'vitest';
import { countsInWords, filterItems, parseItems, STATUS_ORDER, type ConceptItem } from '../../src/islands/conceptmap.ts';

const items: ConceptItem[] = [
  { concept: 'Colors', status: 'got it', description: 'everyday color names' },
  { concept: 'Shapes', status: 'getting there', description: 'everyday shape names' },
  { concept: 'Plants', status: 'learning', description: 'everyday plant names' },
  { concept: 'Weather', status: 'not started', description: 'everyday weather words' },
];

describe('concept map input', () => {
  it('reads a clean list, preserves supplied text, and copies its records', () => {
    const input = structuredClone(items);
    const parsed = parseItems(input);
    expect(parsed).toEqual(items);
    expect(parsed[0]!.concept).toBe('Colors');
    parsed[0]!.description = 'changed';
    expect(input).toEqual(items);
  });
  it.each([null, {}, [], new Array(1)].map((input) => ({ input })))('rejects an empty or invalid list %j', ({ input }) => {
    expect(() => parseItems(input)).toThrow();
  });
  it('rejects repeated concepts, including case and outer-whitespace variations', () => {
    expect(() => parseItems([items[0], items[0]])).toThrow(/repeated/);
    expect(() => parseItems([items[0], { ...items[0], concept: ' colors ' }])).toThrow(/repeated/);
  });
  it.each(['', 'known', 'mastered', null])('rejects an unknown status %j', (status) => {
    expect(() => parseItems([{ ...items[0], status }])).toThrow(/status/);
  });
  it('requires concept names and descriptions to be nonempty text', () => {
    expect(() => parseItems([{ ...items[0], concept: '' }])).toThrow(/name/);
    expect(() => parseItems([{ ...items[0], concept: null }])).toThrow(/name/);
    expect(() => parseItems([{ ...items[0], description: ' ' }])).toThrow(/description/);
    expect(() => parseItems([{ ...items[0], description: 1 }])).toThrow(/description/);
  });
  it.each([
    { field: 'description', value: '80% chance of a passing score' },
    { field: 'concept', value: 'exam score' },
    { field: 'description', value: 'a SCORE target' },
    { field: 'concept', value: 'Chance of passing' },
    { field: 'description', value: '90% complete' },
  ])('rejects predictive supplied text in $field: $value', ({ field, value }) => {
    expect(() => parseItems([{ ...items[0], [field]: value }])).toThrow('use plain study-status text without predictions.');
    try { parseItems([{ ...items[0], [field]: value }]); }
    catch (error) { expect((error as Error).message).not.toMatch(/%|score|chance/i); }
  });
});

describe('concept counts and filters', () => {
  it('uses the required order and leaves out zero counts', () => {
    expect(STATUS_ORDER).toEqual(['got it', 'getting there', 'learning', 'not started']);
    expect(countsInWords(items)).toBe('1 got it, 1 getting there, 1 learning, 1 not started.');
    const additional: ConceptItem = { concept: 'Sizes', status: 'got it', description: 'everyday size words' };
    expect(countsInWords([...items, additional])).toBe('2 got it, 1 getting there, 1 learning, 1 not started.');
    expect(countsInWords([items[0]!, items[2]!])).toBe('1 got it, 1 learning.');
    expect(countsInWords([])).toBe('no concepts yet.');
  });
  it('filters by each status, preserving item order and the original list', () => {
    for (const status of STATUS_ORDER) expect(filterItems(items, status)).toEqual(items.filter((item) => item.status === status));
    const all = filterItems(items, 'all');
    expect(all).toEqual(items); expect(all).not.toBe(items);
    all.pop(); expect(items).toHaveLength(4);
    expect(filterItems([items[0]!], 'learning')).toEqual([]);
  });
  it('outputs only plain status counts and never predictive metrics', () => {
    for (const list of [items, [items[0]!], []]) expect(countsInWords(list)).not.toMatch(/%|score|chance/i);
  });
});
