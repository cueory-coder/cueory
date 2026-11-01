import { describe, expect, it, vi } from 'vitest';
import { statusesFrom, type ConceptAttempt, type ConceptDefinition } from '../../src/islands/conceptstatus';
import { conceptStatus, type AdaptiveQuestion } from '../../src/islands/adaptive';
import { parseItems } from '../../src/islands/conceptmap';

const concepts: ConceptDefinition[] = [
  { id: 'sample-colors', concept: 'sample: colors' },
  { id: 'sample-shapes', concept: 'sample: shapes' },
];
const attempt = (changes: Partial<ConceptAttempt> = {}): ConceptAttempt => ({
  item_id: 'sample-item', concept_id: 'sample-colors', correct: true, level: 1,
  created_at: '2026-11-01T10:00:00.000Z', ...changes,
});
function sequence(levels: (1 | 2 | 3)[], results: boolean[] = levels.map(() => true)): ConceptAttempt[] {
  return levels.map((level, index) => attempt({ level, correct: results[index], created_at: `2026-11-01T10:00:0${index}.000Z` }));
}

describe('concept status adapter', () => {
  it('returns one map-ready status per supplied concept, in supplied order, with no history', () => {
    const result = statusesFrom([], concepts);
    expect(result).toEqual({ statuses: [
      { id: 'sample-colors', concept: 'sample: colors', status: 'not started', description: "'sample: colors' has not been started." },
      { id: 'sample-shapes', concept: 'sample: shapes', status: 'not started', description: "'sample: shapes' has not been started." },
    ], skipped: 0 });
    expect(parseItems(result.statuses)).toHaveLength(2);
    expect(statusesFrom([], [])).toEqual({ statuses: [], skipped: 0 });
  });

  it.each([
    [[1], 'learning'], [[1, 1], 'getting there'], [[1, 1, 2, 2], 'got it'], [[2, 2], 'learning'], [[3, 3], 'learning'],
  ] as const)('uses the existing adaptive rules for recorded levels %j', (levels, expected) => {
    expect(statusesFrom(sequence([...levels]), concepts).statuses.map(value => value.status)).toEqual([expected, 'not started']);
  });

  it('uses each attempt’s recorded level even when the same item id recurs', () => {
    const history = sequence([1, 1, 2, 2]);
    expect(new Set(history.map(value => value.item_id)).size).toBe(1);
    expect(statusesFrom(history, concepts).statuses[0].status).toBe('got it');
    history.push(attempt({ level: 3, correct: false, created_at: '2026-11-01T10:00:04Z' }));
    expect(statusesFrom(history, concepts).statuses[0].status).toBe('getting there');
  });

  it('keeps mixed concepts independent while matching the map’s names to database ids', () => {
    const colors = sequence([1, 1, 2, 2]);
    const shapes = sequence([1]).map(value => ({ ...value, concept_id: 'sample-shapes', correct: false }));
    expect(statusesFrom([...shapes, ...colors], concepts).statuses.map(value => [value.id, value.concept, value.status])).toEqual([
      ['sample-colors', 'sample: colors', 'got it'], ['sample-shapes', 'sample: shapes', 'learning'],
    ]);
    expect(statusesFrom([...colors, ...shapes], [...concepts].reverse()).statuses[0].id).toBe('sample-shapes');
  });

  it('sorts attempts chronologically before passing them to the adaptive engine', () => {
    const history = sequence([1, 1, 2, 2]);
    expect(statusesFrom([history[3], history[1], history[2], history[0]], concepts))
      .toEqual(statusesFrom(history, concepts));
  });

  it('compares timestamp instants rather than their offset text', () => {
    const history = [
      attempt({ created_at: '2026-11-01T12:00:00+02:00' }),
      attempt({ created_at: '2026-11-01T03:00:01-07:00' }),
      attempt({ level: 2, created_at: '2026-11-01T10:00:02Z' }),
      attempt({ level: 2, created_at: '2026-11-01T11:00:03+01:00' }),
    ];
    expect(statusesFrom(history.toReversed(), concepts).statuses[0].status).toBe('got it');
  });

  it('sorts Postgres microseconds rather than treating a millisecond as a tie', () => {
    const earliest = attempt({ created_at: '2026-11-01T10:00:00.000001Z' });
    const second = attempt({ created_at: '2026-11-01T10:00:00.000002Z' });
    const last = attempt({ level: 2, correct: false, created_at: '2026-11-01T10:00:00.000003Z' });
    expect(statusesFrom([last, second, earliest], concepts).statuses[0].status).toBe('learning');
  });

  it('preserves input order for equal instants, including different timezone spellings', () => {
    const first = attempt({ created_at: '2026-11-01T12:00:00+02:00' });
    const second = attempt({ created_at: '2026-11-01T10:00:00.000000Z' });
    const miss = attempt({ level: 2, correct: false, created_at: '2026-11-01T03:00:00-07:00' });
    expect(statusesFrom([first, second, miss], concepts).statuses[0].status).toBe('learning');
    expect(statusesFrom([miss, first, second], concepts).statuses[0].status).toBe('getting there');
  });

  it('ignores and counts unknown concepts without copying their records or names', () => {
    const hidden = 'sample: private unknown value';
    const history = [attempt(), attempt({ concept_id: hidden }), attempt({ concept_id: 'sample-unknown' })];
    const result = statusesFrom(history, concepts);
    expect(result.skipped).toBe(2);
    expect(result.statuses.map(value => value.status)).toEqual(['learning', 'not started']);
    expect(JSON.stringify(result)).not.toContain(hidden);
    expect(statusesFrom(history, []).skipped).toBe(3);
  });

  it.each([
    null, {}, { ...attempt(), item_id: '' }, { ...attempt(), correct: 'true' }, { ...attempt(), level: 0 },
    { ...attempt(), level: 4 }, { ...attempt(), level: '1' }, { ...attempt(), created_at: '' },
    { ...attempt(), created_at: '2026-02-30T10:00:00Z' }, { ...attempt(), created_at: '2026-11-01T24:00:00Z' },
    { ...attempt(), created_at: '2026-11-01T10:00:00+24:00' }, { ...attempt(), created_at: 'sample: not a date' },
  ])('skips a malformed record %j instead of granting progress', value => {
    const result = statusesFrom([value as unknown as ConceptAttempt], concepts);
    expect(result.skipped).toBe(1);
    expect(result.statuses.every(item => item.status === 'not started')).toBe(true);
  });

  it('does not execute record getters or copy extra attempt/concept fields', () => {
    const getter = vi.fn(() => true);
    const withGetter = Object.defineProperty(attempt(), 'correct', { enumerable: true, get: getter });
    expect(statusesFrom([withGetter], concepts).skipped).toBe(1);
    expect(getter).not.toHaveBeenCalled();
    const hidden = 'sample: discarded metadata';
    const history = [{ ...attempt(), extra: hidden }];
    const definitions = [{ ...concepts[0], extra: hidden }];
    const result = statusesFrom(history, definitions);
    expect(Object.keys(result.statuses[0])).toEqual(['id', 'concept', 'status', 'description']);
    expect(JSON.stringify(result)).not.toContain(hidden);
  });

  it('preserves display labels exactly and delegates wording/status to the existing adaptive function', () => {
    const history = sequence([1, 1, 2, 2]);
    const concept = { id: 'sample-id', concept: '  Sample: COLORS  ' };
    const questions: AdaptiveQuestion[] = history.map((value, index) => ({ id: String(index), concept: concept.concept, level: value.level }));
    const expected = conceptStatus(questions, history.map((value, index) => ({ questionId: String(index), right: value.correct })))[0];
    const result = statusesFrom(history.map(value => ({ ...value, concept_id: concept.id })), [concept]);
    expect(result.statuses[0]).toEqual({ id: concept.id, ...expected });
    expect(result.statuses[0].concept).toBe('  Sample: COLORS  ');
  });

  it('returns fresh map data without changing the supplied arrays or records', () => {
    const history = sequence([1, 1, 2, 2]).reverse();
    const before = structuredClone(history);
    history.forEach(Object.freeze); Object.freeze(history);
    const definitions = concepts.map(value => Object.freeze({ ...value })); Object.freeze(definitions);
    const result = statusesFrom(history, definitions);
    result.statuses[0].description = 'sample: changed'; result.statuses.pop();
    expect(statusesFrom(history, definitions).statuses).toHaveLength(2);
    expect(history).toEqual(before);
  });

  it('refuses ambiguous concept definitions through the existing map validator', () => {
    expect(() => statusesFrom([], [concepts[0], concepts[0]])).toThrow('different, nonempty id');
    expect(() => statusesFrom([], [concepts[0], { id: 'sample-other', concept: ' SAMPLE: COLORS ' }])).toThrow('a concept is repeated');
    expect(() => statusesFrom([], [{ id: 'sample-id', concept: '' }])).toThrow('each concept needs a name');
  });
});
