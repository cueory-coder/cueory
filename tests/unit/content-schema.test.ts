import { describe, expect, it } from 'vitest';
import { repeatedCardIndexes } from '../../src/content/card-schema';

describe('card content schema helpers', () => {
  it('identifies only later occurrences of repeated card ids', () => {
    expect(repeatedCardIndexes(['one', 'two', 'one', 'two', 'three', 'two'])).toEqual([2, 3, 5]);
  });

  it('accepts a deck whose card ids are unique', () => {
    expect(repeatedCardIndexes(['one', 'two', 'three'])).toEqual([]);
  });
});
