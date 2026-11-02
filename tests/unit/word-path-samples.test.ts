import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePuzzle } from '../../src/islands/suture';

/** How many times a word can be picked in the grid: every row and column, read either way. */
function places(grid: string[], word: string): number {
  const lines = [...grid, ...[...grid[0]!].map((_, col) => grid.map((row) => row[col]).join(''))];
  const count = (line: string) => [...line].filter((_, i) => line.startsWith(word, i)).length;
  return lines.reduce((sum, line) => sum + count(line) + count([...line].reverse().join('')), 0);
}

describe('word path samples (D-71, Task 97)', () => {
  const folder = new URL('../../content/games/suture/', import.meta.url);
  const files = readdirSync(folder).filter((name) => name.endsWith('.json'));

  it('has at least five labeled samples', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const name of files) expect(name).toMatch(/^sample-\d{2}\.json$/);
  });

  it.each(files)("%s is themed, passes the game's own rules, and hides each word in one place only", (name) => {
    const data = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
    expect(data.status).toBe('sample');
    expect(typeof data.theme).toBe('string');
    expect(data.theme).toBe(data.theme.toLowerCase());
    const puzzle = parsePuzzle({ id: name.replace('.json', ''), sample: true, theme: data.theme, grid: data.grid, words: data.words });
    expect(puzzle.theme!.length).toBeLessThanOrEqual(60);
    expect(puzzle.grid).toHaveLength(11);
    expect(puzzle.grid[0]).toHaveLength(11);
    for (const word of puzzle.words) {
      // One place only, so a student who picks the word where they see it is never told it is wrong.
      expect(places(puzzle.grid, word.answer)).toBe(1);
      if (word.cue !== undefined) expect(word.cue).toBe(word.cue.toLowerCase());
    }
  });
});
