import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePuzzle } from '../../src/islands/suture';

/** Every way to spell a word along touching cells (up, down, left, right), each cell once. */
function paths(grid: string[], word: string): number {
  let count = 0;
  const walk = (row: number, col: number, i: number, used: Set<string>) => {
    if (grid[row]?.[col] !== word[i]) return;
    if (i === word.length - 1) {
      count++;
      return;
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${row + dr},${col + dc}`;
      if (!used.has(key)) walk(row + dr, col + dc, i + 1, new Set(used).add(key));
    }
  };
  grid.forEach((line, row) => [...line].forEach((_, col) => walk(row, col, 0, new Set([`${row},${col}`]))));
  return count;
}

describe('word path samples (D-71)', () => {
  it("keeps every sample labeled, passes the game's own rules, and hides each word along one path only", () => {
    const folder = new URL('../../content/games/suture/', import.meta.url);
    const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const name of files) {
      const data = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
      expect(name).toMatch(/^sample-\d{2}\.json$/);
      expect(data.status).toBe('sample');
      const puzzle = parsePuzzle({ id: name.replace('.json', ''), sample: true, grid: data.grid, words: data.words });
      for (const word of puzzle.words) {
        expect(word.cue).toBe(word.cue.toLowerCase());
        // One path only, so a correct trace of the word is never refused for taking another route.
        expect(paths(puzzle.grid, word.answer)).toBe(1);
      }
    }
  });
});
