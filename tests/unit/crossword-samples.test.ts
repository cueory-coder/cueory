import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePuzzle, words } from '../../src/islands/cueword';

describe('crossword samples (D-67)', () => {
  it("keeps every sample labeled, and every one passes the game's own rules", () => {
    const folder = new URL('../../content/games/cueword/', import.meta.url);
    const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const name of files) {
      const data = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
      expect(name).toMatch(/^sample-\d{2}\.json$/);
      expect(data.status).toBe('sample');
      const puzzle = parsePuzzle({ id: name.replace('.json', ''), sample: true, grid: data.grid, clues: data.clues });
      // Everyday words only: every answer is a plain word of capital letters, and every clue is lowercase.
      for (const word of words(puzzle)) expect(word.answer).toMatch(/^[A-Z]{2,7}$/);
      for (const clue of [...puzzle.clues.across, ...puzzle.clues.down]) expect(clue.text).toBe(clue.text.toLowerCase());
    }
  });
});
