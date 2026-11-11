import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePuzzle, words } from '../../src/islands/cueword';
import { puzzleForLevel } from '../../src/islands/CuewordToday';

describe('crossword samples (Worker 3)', () => {
  it('keeps samples labeled and entries at least three letters', () => {
    const folder = new URL('../../content/games/cueword/', import.meta.url);
    const files = readdirSync(folder).filter((name) => name.endsWith('.json'));

    expect(files.length).toBeGreaterThanOrEqual(9);

    for (const name of files) {
      expect(name).toMatch(/^sample-\d{2}\.json$/);

      const data = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
      expect(data.status).toBe('sample');

      const puzzle = parsePuzzle({
        id: name.replace('.json', ''),
        sample: true,
        grid: data.grid,
        clues: data.clues,
      });

      for (const word of words(puzzle)) {
        expect(word.answer.length).toBeGreaterThanOrEqual(3);
      }

      for (const clue of [...puzzle.clues.across, ...puzzle.clues.down]) {
        expect(clue.text).toBe('[sample clue]');
      }
    }
  });

  it('selects only exact-size samples for each level', () => {
    const folder = new URL('../../content/games/cueword/', import.meta.url);
    const puzzles = readdirSync(folder)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const data = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
        return parsePuzzle({
          id: name.replace('.json', ''),
          sample: true,
          grid: data.grid,
          clues: data.clues,
        });
      });

    expect(puzzleForLevel(puzzles, 5)?.grid).toHaveLength(5);
    expect(puzzleForLevel(puzzles, 5)?.grid[0]).toHaveLength(5);
    expect(puzzleForLevel(puzzles, 7)?.grid).toHaveLength(7);
    expect(puzzleForLevel(puzzles, 15)?.grid).toHaveLength(15);
    expect(puzzleForLevel(puzzles, 6)).toBeUndefined();
  });
});
