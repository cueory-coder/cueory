import { describe, expect, it } from 'vitest';
import {
  filterButtonValue, filterFromButton, lessonCountLabel, libraryFilterUrl,
  parseLibraryFilter, showsLesson, showsUnit,
} from '../../src/lessons/libraryfilter';

const units = ['U00', 'U01'] as const;
const lessonUnits = [undefined, 'U00', 'U01'] as const;
const matching = (filter: ReturnType<typeof parseLibraryFilter>) =>
  lessonUnits.filter((unitId) => showsLesson(unitId, filter));

describe('course-library filters', () => {
  it('shows all lessons and units by default', () => {
    const filter = parseLibraryFilter('', units);
    expect(filter).toEqual({ kind: 'all' });
    expect(matching(filter)).toEqual(lessonUnits);
    expect(units.every((unit) => showsUnit(unit, filter))).toBe(true);
  });

  it('shows only the legacy sample under study skills', () => {
    const filter = parseLibraryFilter('?course=study-skills', units);
    expect(matching(filter)).toEqual([undefined]);
    expect(units.some((unit) => showsUnit(unit, filter))).toBe(false);
  });

  it('shows only mapped lessons under med-surg i', () => {
    const filter = parseLibraryFilter('?course=med-surg-i', units);
    expect(matching(filter)).toEqual(['U00', 'U01']);
    expect(units.every((unit) => showsUnit(unit, filter))).toBe(true);
  });

  it('filters to one unit without including legacy or other-unit lessons', () => {
    const filter = parseLibraryFilter('?unit=U01', units);
    expect(matching(filter)).toEqual(['U01']);
    expect(showsUnit('U01', filter)).toBe(true);
    expect(showsUnit('U00', filter)).toBe(false);
    expect(filterButtonValue(filter)).toBe('unit:U01');
  });

  it('handles empty results without inventing links or lessons', () => {
    const filter = parseLibraryFilter('?unit=U01', units);
    expect(([undefined, 'U00'] as const).filter((unitId) => showsLesson(unitId, filter))).toEqual([]);
    expect(lessonCountLabel(0, 2)).toBe('showing 0 lessons of 2 open lessons');
  });

  it('treats unknown units and courses as all without hiding the page', () => {
    expect(parseLibraryFilter('?unit=U99', units)).toEqual({ kind: 'all' });
    expect(parseLibraryFilter('?course=unknown', units)).toEqual({ kind: 'all' });
    expect(filterFromButton('unit:U99', units)).toEqual({ kind: 'all' });
    expect(filterFromButton('other', units)).toEqual({ kind: 'all' });
  });

  it('prefers a known unit parameter over a course parameter', () => {
    expect(parseLibraryFilter('?unit=U00&course=study-skills', units)).toEqual({ kind: 'unit', unitId: 'U00' });
    expect(parseLibraryFilter('?unit=U99&course=study-skills', units)).toEqual({ kind: 'all' });
  });

  it('preserves unrelated URL values and browser-navigation state', () => {
    const medSurg = filterFromButton('course:med-surg-i', units);
    expect(filterButtonValue(medSurg)).toBe('course:med-surg-i');
    const href = libraryFilterUrl('https://cueory.app/learn?from=home&unit=U00#planned-units-title', medSurg);
    expect(href).toBe('/learn?from=home&course=med-surg-i#planned-units-title');
    expect(parseLibraryFilter(new URL(href, 'https://cueory.app').search, units)).toEqual(medSurg);
    expect(libraryFilterUrl('https://cueory.app/learn?unit=U00', { kind: 'all' })).toBe('/learn');
  });

  it('labels zero, one, and multiple open lessons correctly', () => {
    expect(lessonCountLabel(0, 0)).toBe('showing 0 lessons of 0 open lessons');
    expect(lessonCountLabel(1, 3)).toBe('showing 1 lesson of 3 open lessons');
    expect(lessonCountLabel(3, 3)).toBe('showing 3 lessons of 3 open lessons');
  });

  it('does not change its caller-owned lists', () => {
    const before = [...units];
    parseLibraryFilter('?unit=U00', units);
    filterFromButton('unit:U01', units);
    expect([...units]).toEqual(before);
  });

  it('does not let blank or case-mismatched URL values select a unit or course', () => {
    for (const search of ['?unit=', '?unit=u00', '?course=', '?course=Med-Surg-I']) {
      expect(parseLibraryFilter(search, units)).toEqual({ kind: 'all' });
    }
    expect(filterFromButton('unit:u01', units)).toEqual({ kind: 'all' });
    expect(filterFromButton('course:MED-SURG-I', units)).toEqual({ kind: 'all' });
  });

  it('replaces duplicate old filter values without losing unrelated query parameters', () => {
    const url = libraryFilterUrl(
      'https://cueory.app/learn?unit=U00&course=study-skills&unit=U01&from=home#library',
      { kind: 'unit', unitId: 'U01' },
    );
    expect(url).toBe('/learn?from=home&unit=U01#library');
    expect(new URL(url, 'https://cueory.app').searchParams.getAll('unit')).toEqual(['U01']);
    expect(new URL(url, 'https://cueory.app').searchParams.get('from')).toBe('home');
    expect(parseLibraryFilter(new URL(url, 'https://cueory.app').search, units))
      .toEqual({ kind: 'unit', unitId: 'U01' });
  });

  it('does not mutate a frozen list of valid unit ids', () => {
    const frozen = Object.freeze(['U00', 'U01'] as const);
    expect(parseLibraryFilter('?unit=U00', frozen)).toEqual({ kind: 'unit', unitId: 'U00' });
    expect(filterFromButton('unit:U01', frozen)).toEqual({ kind: 'unit', unitId: 'U01' });
  });
});
