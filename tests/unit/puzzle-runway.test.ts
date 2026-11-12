import { describe, expect, it } from 'vitest';
import { dayNumber, puzzleForDay } from '../../src/islands/pulse';
import { analyzePuzzleRunway, puzzleRunways, readGameSampleFiles, runwayDayNumber, runwayLines, type SampleFile } from '../../src/content/runway';

const at = (day: number) => new Date(2026, 10, day, 12);
const word = (name: string, value: string): SampleFile => ({
  name,
  data: { status: 'sample', word: value, cue: '[sample clue]' },
});
const examples = () => [word('sample-01.json', 'aaaaa'), word('sample-02.json', 'bbbbb'), word('sample-03.json', 'ccccc')];

// Uses the existing game's actual day math and modulo selection rather than inventing a new clock.
describe('runway calendar and selection contract', () => {
  it('matches the game day number at local midnight, across DST and year boundaries', () => {
    for (const date of [at(1), at(2), at(11), new Date(2027, 0, 1), new Date(2027, 2, 14)]) {
      expect(runwayDayNumber(date)).toBe(dayNumber(date));
    }
    expect(runwayDayNumber(at(1))).toBe(0);
    expect(() => runwayDayNumber(new Date(Number.NaN))).toThrow(/valid date/);
  });

  it('counts today as available, never promises a new sample after the first cycle', () => {
    const report = analyzePuzzleRunway('pulse', examples(), at(1));
    expect(report).toMatchObject({ firstDay: '2026-11-01', lastDay: '2026-11-03', daysLeft: 3, sampleCount: 3 });
    expect(analyzePuzzleRunway('pulse', examples(), at(3)).daysLeft).toBe(1);
    expect(analyzePuzzleRunway('pulse', examples(), at(4)).daysLeft).toBe(0);
    expect(analyzePuzzleRunway('pulse', examples(), new Date(2026, 9, 31)).daysLeft).toBe(3);
    const puzzles = examples().map((item) => (item.data as { word: string }).word);
    expect(puzzleForDay(puzzles, dayNumber(at(4)))).toBe(puzzles[0]);
  });
});

describe('bad sample fixture detection', () => {
  it('reports missing day slots, including a missing first day', () => {
    const gapped = analyzePuzzleRunway('pulse', [examples()[0]!, examples()[2]!], at(1));
    expect(gapped.gaps).toEqual(['2026-11-02']);
    expect(gapped).toMatchObject({ daysLeft: 1, firstDay: '2026-11-01', lastDay: '2026-11-01' });
    expect(analyzePuzzleRunway('pulse', [examples()[0]!, examples()[2]!], at(2)).daysLeft).toBe(0);
    expect(analyzePuzzleRunway('pulse', [examples()[0]!, examples()[2]!], at(3)).daysLeft).toBe(0);
    expect(analyzePuzzleRunway('pulse', [examples()[1]!], at(1)).gaps).toEqual(['2026-11-01']);
  });

  it('reports duplicate calendar slots even when filenames differ', () => {
    const files = [word('sample-01.json', 'aaaaa'), word('sample-1.json', 'bbbbb')];
    const report = analyzePuzzleRunway('pulse', files, at(1));
    expect(report.duplicates).toEqual([{ day: '2026-11-01', files: ['sample-01.json', 'sample-1.json'] }]);
    expect(report.invalidFiles).toContain('sample-1.json');
    expect(report.daysLeft).toBe(0);
    const paddedDuplicate = [word('sample-001.json', 'ccccc'), word('sample-01.json', 'ddddd')];
    const padded = analyzePuzzleRunway('pulse', paddedDuplicate, at(1));
    expect(padded.duplicates).toHaveLength(1);
    expect(padded.daysLeft).toBe(0);
  });

  it('reports a repeated playable puzzle before the first cycle is complete', () => {
    const files = [word('sample-01.json', 'aaaaa'), word('sample-02.json', 'aaaaa')];
    const report = analyzePuzzleRunway('pulse', files, at(1));
    expect(report.repeats).toEqual([{ firstDay: '2026-11-01', repeatedDay: '2026-11-02' }]);
    expect(report.daysLeft).toBe(1);
    expect(analyzePuzzleRunway('pulse', files, at(2)).daysLeft).toBe(0);
  });

  it('detects bad labels, unplayable words and unexpected filenames', () => {
    const unlabeled = word('sample-01.json', 'aaaaa');
    unlabeled.data = { word: 'aaaaa', cue: '[sample clue]' };
    const wrong = word('sample-02.json', 'aaaaaa');
    const oddlyNamed = word('other.json', 'ccccc');
    const report = analyzePuzzleRunway('pulse', [unlabeled, wrong, oddlyNamed], at(1));
    expect(report.invalidFiles).toEqual(expect.arrayContaining(['sample-01.json', 'sample-02.json', 'other.json']));
    expect(report.daysLeft).toBe(0);
  });

  it('detects filename ordering that would change the game rotation', () => {
    const files = [word('sample-01.json', 'aaaaa'), word('sample-03.json', 'bbbbb'), word('sample-02.json', 'ccccc')];
    expect(analyzePuzzleRunway('pulse', files, at(1)).outOfOrder).toEqual([]);
    const bad = [word('sample-01.json', 'aaaaa'), word('sample-10.json', 'bbbbb'), word('sample-02.json', 'ccccc')];
    expect(analyzePuzzleRunway('pulse', bad, at(1)).outOfOrder).toContain('sample-10.json');
  });
});

describe('tracked public folders', () => {
  it('reads all active sample collections without a gap, duplicate, repeated puzzle or invalid file', () => {
    const reports = puzzleRunways(at(1));
    expect(reports.map((row) => row.game)).toEqual(['pulse', 'cueword', 'sudoku', 'suture', 'triage']);
    for (const report of reports) {
      if (report.source === 'generated') continue;
      expect(report.sampleCount, report.game + ' is empty').toBeGreaterThan(0);
      expect(report.firstDay).toBe('2026-11-01');
      expect(report.gaps, report.game + ' gaps').toEqual([]);
      expect(report.duplicates, report.game + ' duplicate days').toEqual([]);
      expect(report.repeats, report.game + ' repeated puzzles').toEqual([]);
      expect(report.invalidFiles, report.game + ' invalid files').toEqual([]);
      expect(report.outOfOrder, report.game + ' sort order').toEqual([]);
      expect(report.daysLeft).toBe(report.sampleCount);
    }
  });

  it('distinguishes generated Sudoku from legacy sort files and non-daily games', () => {
    const report = puzzleRunways(at(1));
    const sudoku = report.find((row) => row.game === 'sudoku')!;
    const legacy = report.find((row) => row.game === 'triage')!;
    expect(sudoku).toMatchObject({ source: 'generated', firstDay: null, lastDay: null, daysLeft: null, sampleCount: 0 });
    expect(legacy.source).toBe('legacy-samples');
    expect(legacy.sampleCount).toBe(readGameSampleFiles('triage').length);
    expect(report.map((row) => row.game)).not.toContain('stat');
    expect(report.map((row) => row.game)).not.toContain('hello-cards');
  });

  it('shows a concise, safe report that contains no puzzle text', () => {
    const lines = runwayLines(at(11));
    expect(lines).toHaveLength(5);
    expect(lines.find((line) => line.startsWith('sudoku '))).toContain('generated each day');
    // Adding more samples must extend the runway without breaking this test.
    const pastLastSample = at(readGameSampleFiles('pulse').length + 2);
    const afterRunway = runwayLines(pastLastSample);
    expect(afterRunway.find((line) => line.startsWith('pulse '))).toContain('0 fresh sample days left');
    expect(lines.join('\n')).not.toContain('[sample clue]');
  });
});

describe('runway edge cases and accessible status text', () => {
  it('stops at the first missing day rather than promising later valid filenames', () => {
    const rows = [
      word('sample-01.json', 'aaaaa'),
      word('sample-03.json', 'bbbbb'),
      word('sample-04.json', 'ccccc'),
    ];
    const first = analyzePuzzleRunway('pulse', rows, at(1));
    expect(first.gaps).toEqual(['2026-11-02']);
    expect(first.daysLeft).toBe(1);
    expect(first.lastDay).toBe('2026-11-01');
    expect(analyzePuzzleRunway('pulse', rows, at(2)).daysLeft).toBe(0);
  });

  it('handles an empty folder and dates before the first sample', () => {
    expect(analyzePuzzleRunway('pulse', [], at(1))).toMatchObject({
      firstDay: null, lastDay: null, daysLeft: 0, sampleCount: 0,
    });
    expect(analyzePuzzleRunway('pulse', examples(), new Date(2026, 9, 31)).daysLeft).toBe(3);
  });

  it('describes each game in words without requiring color to read its status', () => {
    const lines = runwayLines(at(11));
    for (const line of lines) {
      expect(line).toMatch(/fresh sample days left|generated each day/);
      expect(line).toMatch(/issue\(s\)/);
      expect(line).not.toMatch(/\x1b\[[0-9;]*m/);
    }
  });
});
