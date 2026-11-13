import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findShortRunways, gameName, MIN_RUNWAY_DAYS, parseRunwayArgs, runwayCheckLines,
} from '../../scripts/check-puzzle-runway.mjs';

const row = (game: string, daysLeft: number | null, source = 'rotating-samples') => ({ game, source, daysLeft });
const healthy = () => [
  row('pulse', 30), row('cueword-easy', 14), row('cueword-mid', 20), row('cueword-hard', 15),
  row('sudoku', null, 'generated'), row('suture', 40), row('triage', 0, 'legacy-samples'),
];

describe('puzzle runway launch check (L4)', () => {
  it('needs 14 days by default', () => {
    expect(MIN_RUNWAY_DAYS).toBe(14);
  });

  it('passes when every played game has at least the minimum, counting exactly 14 as enough', () => {
    expect(findShortRunways(healthy())).toEqual([]);
    expect(runwayCheckLines([])).toEqual([
      'Puzzle runway OK: every daily game has at least 14 days of puzzles scheduled ahead.',
    ]);
  });

  it('lists each short game and by how many days', () => {
    const rows = healthy();
    rows[0] = row('pulse', 0);
    rows[2] = row('cueword-mid', 13);
    rows[5] = row('suture', 5);
    const short = findShortRunways(rows);
    expect(short).toEqual([
      { game: 'pulse', name: 'pillo', daysLeft: 0, shortBy: 14 },
      { game: 'cueword-mid', name: 'crossword (mid)', daysLeft: 13, shortBy: 1 },
      { game: 'suture', name: 'word path', daysLeft: 5, shortBy: 9 },
    ]);
    expect(runwayCheckLines(short)).toEqual([
      'Puzzle runway too short: 3 games need at least 14 days scheduled ahead.',
      '- pillo: 0 days left, short by 14 days',
      '- crossword (mid): 13 days left, short by 1 day',
      '- word path: 5 days left, short by 9 days',
      'Add puzzles for these games, then run this check again.',
    ]);
  });

  it('uses singular wording for one game or one day', () => {
    const short = findShortRunways([row('cueword-hard', 1)], 2);
    expect(runwayCheckLines(short, 2)).toEqual([
      'Puzzle runway too short: 1 game needs at least 2 days scheduled ahead.',
      '- crossword (hard): 1 day left, short by 1 day',
      'Add puzzles for these games, then run this check again.',
    ]);
  });

  it('never counts generated sudoku or the retired sorting samples as short', () => {
    const rows = [row('sudoku', null, 'generated'), row('triage', 0, 'legacy-samples'), row('pulse', 14)];
    expect(findShortRunways(rows)).toEqual([]);
  });

  it('treats a played game with a missing or broken count as 0 days, so it cannot pass by accident', () => {
    const rows = [row('pulse', null), row('suture', Number.NaN), row('cueword-easy', -3), row('new-game', 2.5)];
    expect(findShortRunways(rows).map((item) => [item.name, item.daysLeft, item.shortBy])).toEqual([
      ['pillo', 0, 14], ['word path', 0, 14], ['crossword (easy)', 0, 14], ['new-game', 0, 14],
    ]);
  });

  it('honors a custom minimum and rejects a bad minimum or an empty report', () => {
    expect(findShortRunways(healthy(), 21).map((item) => [item.game, item.shortBy])).toEqual([
      ['cueword-easy', 7], ['cueword-mid', 1], ['cueword-hard', 6],
    ]);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => findShortRunways(healthy(), bad)).toThrow(/whole number/);
      expect(() => runwayCheckLines([], bad)).toThrow(/whole number/);
    }
    expect(() => findShortRunways([])).toThrow(/empty/);
  });

  it('names games the way visitors see them', () => {
    expect(['pulse', 'cueword-easy', 'suture', 'sudoku', 'unknown'].map(gameName))
      .toEqual(['pillo', 'crossword (easy)', 'word path', 'sudoku', 'unknown']);
    expect(gameName('constructor')).toBe('constructor');
  });

  it('reads --days and --date, and rejects anything else', () => {
    const now = new Date(2026, 10, 12, 9);
    expect(parseRunwayArgs([], now)).toEqual({ minDays: 14, asOf: now });
    const parsed = parseRunwayArgs(['--days', '21', '--date', '2026-11-17'], now);
    expect(parsed.minDays).toBe(21);
    expect([parsed.asOf.getFullYear(), parsed.asOf.getMonth(), parsed.asOf.getDate()]).toEqual([2026, 10, 17]);
    for (const args of [['--days'], ['--days', 'ten'], ['--days', '0'], ['--date', '2026-02-30'],
      ['--date', '11/17/2026'], ['--date', '0099-11-17'], ['--verbose', 'yes']]) {
      expect(() => parseRunwayArgs(args, now)).toThrow();
    }
  });

  it('exits with code 2 and a plain message when an option is wrong', () => {
    const script = fileURLToPath(new URL('../../scripts/check-puzzle-runway.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script, '--days', 'ten'], { encoding: 'utf8' });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('Puzzle runway check could not run: --days must be a whole number');
  });
});


describe('runway report failure at the real CLI boundary', () => {
  it('returns one sanitized line and exit 2 when report generation throws', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'cueory-runway-failure-'));
    try {
      mkdirSync(join(temporary, 'scripts'));
      mkdirSync(join(temporary, 'src', 'content'), { recursive: true });
      const script = join(temporary, 'scripts', 'check-puzzle-runway.mjs');
      copyFileSync(fileURLToPath(new URL('../../scripts/check-puzzle-runway.mjs', import.meta.url)), script);
      writeFileSync(join(temporary, 'src', 'content', 'runway.ts'),
        'export function puzzleRunways() { throw new Error("diagnostic-sentinel"); }');
      const run = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      expect(run.status).toBe(2);
      expect(run.stdout).toBe('');
      expect(run.stderr).toBe('Puzzle runway check could not run: runway report failed.\n');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
