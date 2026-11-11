import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePuzzle, words } from '../../src/islands/cueword';
import { puzzleForLevel } from '../../src/islands/CuewordToday';

const sampleFolder = new URL('../../content/games/cueword/', import.meta.url);
const newSampleNames = new Set(['sample-07.json', 'sample-08.json', 'sample-09.json']);

function readSamples() {
  return readdirSync(sampleFolder)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const data = JSON.parse(readFileSync(new URL(name, sampleFolder), 'utf8'));
      return {
        name,
        data,
        puzzle: parsePuzzle({
          id: name.replace('.json', ''),
          sample: true,
          grid: data.grid,
          clues: data.clues,
        }),
      };
    });
}

describe('crossword samples (Worker 3)', () => {
  it('keeps the six legacy samples valid without changing their content contract', () => {
    const samples = readSamples();
    const legacy = samples.filter(({ name }) => !newSampleNames.has(name));

    expect(legacy).toHaveLength(6);

    for (const { puzzle } of legacy) {
      expect(words(puzzle).every((word) => /^[A-Z]{2,7}$/.test(word.answer))).toBe(true);
      expect(
        [...puzzle.clues.across, ...puzzle.clues.down].every(
          (clue) => clue.text === clue.text.toLowerCase(),
        ),
      ).toBe(true);
    }
  });

  it('keeps only the new level samples placeholder-only and at least three letters long', () => {
    const samples = readSamples().filter(({ name }) => newSampleNames.has(name));

    expect(samples.map(({ puzzle }) => [puzzle.grid.length, puzzle.grid[0]!.length])).toEqual([
      [5, 5],
      [7, 7],
      [15, 15],
    ]);

    for (const { puzzle } of samples) {
      expect(words(puzzle).every((word) => word.answer.length >= 3)).toBe(true);
      expect(
        [...puzzle.clues.across, ...puzzle.clues.down].every(
          (clue) => clue.text === '[sample clue]',
        ),
      ).toBe(true);
    }
  });

  it('selects only exact-size samples for each level', () => {
    const puzzles = readSamples().map(({ puzzle }) => puzzle);

    expect(puzzleForLevel(puzzles, 5)?.grid).toHaveLength(5);
    expect(puzzleForLevel(puzzles, 5)?.grid[0]).toHaveLength(5);
    expect(puzzleForLevel(puzzles, 7)?.grid).toHaveLength(7);
    expect(puzzleForLevel(puzzles, 15)?.grid).toHaveLength(15);
    expect(puzzleForLevel(puzzles, 6)).toBeUndefined();
  });
});
