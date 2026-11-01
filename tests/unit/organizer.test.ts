import { describe, expect, it } from 'vitest';
import { canCheck, check, isDone, parseSet, placeItem, resultInWords, startOrganizer, summary, type OrganizerSet } from '../../src/islands/organizer';

const set: OrganizerSet = {
  id: 'everyday', title: 'Everyday groups',
  groups: [{ id: 'fruit', name: 'Fruits' }, { id: 'color', name: 'Colors' }],
  items: [
    { id: 'apple', text: 'Apple', group: 'fruit' }, { id: 'pear', text: 'Pear', group: 'fruit' },
    { id: 'blue', text: 'Blue', group: 'color' }, { id: 'red', text: 'Red', group: 'color' },
  ],
};
const copy = () => structuredClone(set);

describe('organizer input', () => {
  it('validates a clean set, preserves its text, and copies its arrays', () => {
    const data = copy(); const parsed = parseSet(data);
    expect(parsed).toEqual(set);
    parsed.groups[0]!.name = 'changed'; parsed.items[0]!.text = 'changed';
    expect(data).toEqual(set);
  });
  it.each([null, [], {}, { ...set, id: '' }, { ...set, title: ' ' }])('rejects incomplete input %j', (input) => {
    expect(() => parseSet(input)).toThrow();
  });
  it('requires two to four groups and four to twelve items', () => {
    expect(() => parseSet({ ...set, groups: [] })).toThrow(/2 to 4/);
    expect(() => parseSet({ ...set, groups: Array(5).fill(set.groups[0]) })).toThrow(/2 to 4/);
    expect(() => parseSet({ ...set, items: set.items.slice(0, 3) })).toThrow(/4 to 12/);
    expect(() => parseSet({ ...set, items: Array(13).fill(set.items[0]) })).toThrow(/4 to 12/);
  });
  it('rejects missing and repeated ids, empty text and nonexistent groups', () => {
    const data = copy(); data.groups[1]!.id = data.groups[0]!.id;
    expect(() => parseSet(data)).toThrow(/repeated/);
    data.groups = copy().groups; data.items[1]!.id = data.items[0]!.id;
    expect(() => parseSet(data)).toThrow(/repeated/);
    data.items = copy().items; data.items[0]!.text = '';
    expect(() => parseSet(data)).toThrow(/text/);
    data.items = copy().items; data.items[0]!.group = 'missing';
    expect(() => parseSet(data)).toThrow(/does not exist/);
    data.items = copy().items; data.items[0]!.id = '';
    expect(() => parseSet(data)).toThrow(/id/);
    data.items = copy().items; data.groups[0]!.name = '';
    expect(() => parseSet(data)).toThrow(/name/);
    data.groups[0] = { id: 'tray', name: 'reserved' };
    expect(() => parseSet(data)).toThrow(/reserved/);
  });
});

describe('organizer play', () => {
  it('deals each item once in the same order for the same seed', () => {
    const start = startOrganizer(set, 17);
    expect(startOrganizer(set, 17)).toEqual(start);
    expect([...start.order].sort()).toEqual(['apple', 'blue', 'pear', 'red']);
    expect(Object.values(start.positions)).toEqual(Array(4).fill('tray'));
    expect(start.tries).toBe(0); expect(canCheck(start)).toBe(false);
    expect(set).toEqual(copy());
  });
  it('moves freely between groups and the tray without marking or mutating old state', () => {
    const initial = startOrganizer(set, 2);
    let state = placeItem(initial, 'apple', 'color');
    expect(state.positions.apple).toBe('color');
    expect(initial.positions.apple).toBe('tray');
    expect(state.locked).toEqual([]); expect(state.last).toBeNull();
    state = placeItem(state, 'apple', 'fruit');
    expect(state.positions.apple).toBe('fruit');
    expect(canCheck(state)).toBe(true);
    state = placeItem(state, 'apple', 'tray');
    expect(canCheck(state)).toBe(false);
    expect(placeItem(state, 'unknown', 'fruit')).toBe(state);
    expect(placeItem(state, 'apple', 'unknown')).toBe(state);
  });
  it('locks right items, returns wrong ones, and counts one try per check', () => {
    let state = startOrganizer(set, 2);
    expect(check(state, set)).toBe(state);
    state = placeItem(placeItem(state, 'apple', 'fruit'), 'blue', 'fruit');
    const before = state;
    state = check(state, set);
    expect(state.locked).toEqual(['apple']);
    expect(state.positions).toMatchObject({ apple: 'fruit', blue: 'tray' });
    expect(before.positions.blue).toBe('fruit');
    expect(state.tries).toBe(1); expect(state.last).toEqual({ right: 1, returned: ['blue'] });
    expect(resultInWords(state)).toBe('1 right, 1 back in the tray to try again.');
    expect(placeItem(state, 'apple', 'tray')).toBe(state);
    expect(canCheck(state)).toBe(false);
    expect(check(state, set)).toBe(state);
    state = check(placeItem(state, 'blue', 'color'), set);
    expect(state.tries).toBe(2); expect(state.locked).toContain('blue');
  });
  it('finishes only when every item is locked right, and gives a summary', () => {
    let state = startOrganizer(set, 2);
    expect(isDone(state)).toBe(false);
    expect(resultInWords(state)).toBe('place at least one item, then check.');
    for (const item of set.items) state = placeItem(state, item.id, item.group);
    state = check(state, set);
    expect(isDone(state)).toBe(true);
    expect(summary(state)).toBe('all 4 sorted in 1 try.');
    expect(check(state, set)).toBe(state);
    expect(canCheck(state)).toBe(false);
    expect(startOrganizer(set, 3).locked).toEqual([]);
  });
  it('reports multiple tries after correcting a misplaced item', () => {
    let state = check(placeItem(startOrganizer(set, 1), 'apple', 'color'), set);
    for (const item of set.items) state = placeItem(state, item.id, item.group);
    state = check(state, set);
    expect(summary(state)).toBe('all 4 sorted in 2 tries.');
  });
  it('handles ids that overlap object property names without prototype access', () => {
    const data = copy(); data.items[0]!.id = '__proto__';
    let state = startOrganizer(data, 1);
    state = check(placeItem(state, '__proto__', 'fruit'), data);
    expect(state.locked).toEqual(['__proto__']);
    expect(placeItem(state, 'toString', 'fruit')).toBe(state);
  });
});
