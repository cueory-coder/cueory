import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayLabel } from '../../src/islands/daily';
import {
  answerFor,
  answerInWords,
  dealTerms,
  NONE_NAME,
  placedIn,
  placeName,
  places,
  placeSize,
  placeTerm,
  SLIPS,
  slipsLeftInWords,
  startTriage,
  termsLeft,
  triageShareText,
  type TriagePuzzle,
} from '../../src/islands/triage';

const puzzle: TriagePuzzle = {
  groups: [
    { name: 'fruits', terms: ['apple', 'pear', 'mango'] },
    { name: 'weather', terms: ['rain', 'fog', 'hail'] },
    { name: 'furniture', terms: ['chair', 'sofa', 'desk'] },
  ],
  oddOne: 'violin',
};

/** Sorts every term into its right place. */
const sortAll = (day = 0) => {
  let state = startTriage(puzzle, day);
  for (const term of state.terms) state = placeTerm(state, puzzle, term, answerFor(puzzle, term)!);
  return state;
};

describe('triage samples (D-63)', () => {
  it('keeps triage puzzles as labeled samples: three named groups of three, one odd one out, every term once', () => {
    const folder = new URL('../../content/games/triage/', import.meta.url);
    const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const name of files) {
      const sample = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
      expect(name).toMatch(/^sample-\d{2}\.json$/);
      expect(sample.status).toBe('sample');
      expect(sample.groups).toHaveLength(3);
      const terms = [...sample.groups.flatMap((group: { terms: string[] }) => group.terms), sample.oddOne];
      expect(new Set(terms).size).toBe(10);
      for (const group of sample.groups) {
        expect(group.terms).toHaveLength(3);
        expect(group.name).toBe(group.name.toLowerCase());
      }
      for (const term of terms) expect(term).toMatch(/^[a-z][a-z -]{0,23}$/);
    }
  });
});

describe('triage (D-63)', () => {
  it('knows where each term goes: a group, or none of these for the odd one out', () => {
    expect(answerFor(puzzle, 'pear')).toBe(0);
    expect(answerFor(puzzle, 'fog')).toBe(1);
    expect(answerFor(puzzle, 'desk')).toBe(2);
    expect(answerFor(puzzle, 'violin')).toBe('none');
    expect(answerFor(puzzle, 'kettle')).toBeUndefined();
    expect(places(puzzle)).toEqual([0, 1, 2, 'none']);
    expect(placeName(puzzle, 1)).toBe('weather');
    expect(placeName(puzzle, 'none')).toBe(NONE_NAME);
    expect(placeSize(puzzle, 2)).toBe(3);
    expect(placeSize(puzzle, 'none')).toBe(1);
  });

  it('deals all ten terms in the same order for everyone on a day, never pre-sorted by group', () => {
    const day0 = dealTerms(puzzle, 0);
    expect(day0).toHaveLength(10);
    expect(new Set(day0).size).toBe(10);
    expect(dealTerms(puzzle, 0)).toEqual(day0);
    expect(dealTerms(puzzle, 1)).not.toEqual(day0);
    // A shuffle, not the order in the file.
    expect(day0).not.toEqual([...puzzle.groups.flatMap((group) => group.terms), puzzle.oddOne]);
    expect(dealTerms(puzzle, -3)).toHaveLength(10);
  });

  it('locks a right place in, and sorts the round with the last term', () => {
    let state = startTriage(puzzle, 0);
    state = placeTerm(state, puzzle, 'apple', 0);
    expect(state.placed).toEqual({ apple: 0 });
    expect(termsLeft(state)).toHaveLength(9);
    expect(placedIn(state, 0)).toEqual(['apple']);
    // A term already placed, or one that isn't in the puzzle, changes nothing.
    expect(placeTerm(state, puzzle, 'apple', 1)).toBe(state);
    expect(placeTerm(state, puzzle, 'kettle', 0)).toBe(state);
    const sorted = sortAll();
    expect(sorted.status).toBe('sorted');
    expect(sorted.slips).toBe(0);
    expect(termsLeft(sorted)).toEqual([]);
    expect(placedIn(sorted, 'none')).toEqual(['violin']);
  });

  it('counts a wrong place as a slip, and the third slip ends the round', () => {
    expect(SLIPS).toBe(3);
    let state = startTriage(puzzle, 0);
    expect(slipsLeftInWords(state)).toBe('3 slips left');
    state = placeTerm(state, puzzle, 'apple', 1);
    expect(state.slips).toBe(1);
    expect(state.placed).toEqual({});
    state = placeTerm(state, puzzle, 'violin', 0);
    expect(slipsLeftInWords(state)).toBe('1 slip left');
    expect(state.status).toBe('playing');
    state = placeTerm(state, puzzle, 'fog', 'none');
    expect(state.status).toBe('out');
    expect(slipsLeftInWords(state)).toBe('no slips left');
    // Nothing moves once the round is over.
    expect(placeTerm(state, puzzle, 'fog', 1)).toBe(state);
  });

  it('never mistakes a term for a key it already has, whatever the term is called', () => {
    const tricky: TriagePuzzle = {
      groups: [
        { name: 'one', terms: ['constructor', 'tostring', 'valueof'] },
        { name: 'two', terms: ['b', 'c', 'd'] },
        { name: 'three', terms: ['e', 'f', 'g'] },
      ],
      oddOne: 'h',
    };
    let state = startTriage(tricky, 0);
    expect(termsLeft(state)).toHaveLength(10);
    state = placeTerm(state, tricky, 'constructor', 0);
    expect(state.placed).toEqual({ constructor: 0 });
  });

  it('says where every term goes at the end, in words', () => {
    expect(answerInWords(puzzle)).toEqual([
      'fruits: apple, pear, mango.',
      'weather: rain, fog, hail.',
      'furniture: chair, sofa, desk.',
      'none of these: violin.',
    ]);
  });

  it('shares the result as plain words: no squares, no grid', () => {
    const line = triageShareText(sortAll(), 'sun 1 nov');
    expect(line).toBe('cueory triage, sun 1 nov: sorted with no slips.');
    expect(line).toMatch(/^[\x20-\x7e]+$/);
    let one = startTriage(puzzle, 0);
    one = placeTerm(one, puzzle, 'apple', 'none');
    for (const term of one.terms) one = placeTerm(one, puzzle, term, answerFor(puzzle, term)!);
    expect(triageShareText(one, 'sun 1 nov')).toBe('cueory triage, sun 1 nov: sorted with 1 slip.');
    let out = startTriage(puzzle, 0);
    for (let i = 0; i < SLIPS; i++) out = placeTerm(out, puzzle, 'apple', 'none');
    expect(triageShareText(out, 'sun 1 nov')).toBe('cueory triage, sun 1 nov: not sorted this time.');
  });

  it('writes the date on the share line in plain lowercase words', () => {
    expect(dayLabel(new Date(2026, 10, 1, 15))).toBe('sun 1 nov');
    expect(dayLabel(new Date(2026, 11, 24, 9))).toBe('thu 24 dec');
  });
});
