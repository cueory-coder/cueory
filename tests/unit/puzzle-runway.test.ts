import { describe, expect, it } from 'vitest';
import { parsePuzzle as parseCrossword } from '../../src/islands/cueword';
import { parsePuzzle as parseWordPath } from '../../src/islands/suture';
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

  it('rejects samples that cannot pass the public Astro content schemas', () => {
    // These are structurally playable or acceptable to the game parser,
    // but Astro rejects them before the game page can render.
    const longCue = { status: 'sample', word: 'grace', cue: 'x'.repeat(121) };
    const crossword = readGameSampleFiles('cueword')[0]!.data as {
      status: string; grid: string[]; clues: {
        across: { number: number; text: string }[];
        down: { number: number; text: string }[];
      };
    };
    const longClue = {
      ...crossword,
      clues: {
        ...crossword.clues,
        across: crossword.clues.across.map((clue, i) =>
          i === 0 ? { ...clue, text: 'x'.repeat(121) } : clue),
      },
    };
    const wordPath = { ...(readGameSampleFiles('suture')[0]!.data as Record<string, unknown>) };
    delete wordPath.theme;
    const triage = readGameSampleFiles('triage')[0]!.data as {
      status: string; groups: { name: string; terms: string[] }[]; oddOne: string;
    };
    const shortTriage = { ...triage, groups: triage.groups.slice(0, 1) };
    const duplicateTriage = { ...triage, oddOne: triage.groups[0]!.terms[0]! };
    const invalid: [ 'pulse' | 'cueword' | 'suture' | 'triage', unknown ][] = [
      ['pulse', longCue], ['cueword', longClue], ['suture', wordPath],
      ['triage', shortTriage], ['triage', duplicateTriage],
    ];
    for (const [game, data] of invalid) {
      const report = analyzePuzzleRunway(game, [{ name: 'sample-01.json', data }], at(1));
      expect(report.invalidFiles, game + ' must reject the unbuildable sample').toContain('sample-01.json');
      expect(report.daysLeft).toBe(0);
    }
  });

  it('rejects malformed crossword samples before counting a playable day', () => {
    const filename = 'sample-01.json';
    const malformed = [
      { status: 'sample', grid: ['A'] },
      { status: 'sample', grid: ['CAT', 'ARE', 'TEN'], clues: { across: [], down: [] } },
    ];
    for (const data of malformed) {
      expect(() => parseCrossword({ id: 'sample-01', sample: true, grid: data.grid, clues: data.clues })).toThrow();
      const report = analyzePuzzleRunway('cueword', [{ name: filename, data }], at(1));
      expect(report.invalidFiles).toContain(filename);
      expect(report.daysLeft).toBe(0);
    }
  });

  it('accepts each current crossword level and matches the game parser for larger grids', () => {
    const samples = readGameSampleFiles('cueword');
    for (const [level, size] of [['easy', 5], ['mid', 7], ['hard', 15]] as const) {
      const sample = samples.find((item) => (item.data as { level?: string } | null)?.level === level);
      expect(sample, level + ' sample must exist').toBeDefined();
      const data = sample!.data as { grid: string[]; level: string; clues: unknown };
      expect(data.grid).toHaveLength(size);
      expect(data.grid.every((row) => row.length === size)).toBe(true);
      expect(() => parseCrossword({ id: sample!.name.slice(0, -5), sample: true, ...data })).not.toThrow();
      expect(analyzePuzzleRunway('cueword', [sample!], at(1)).invalidFiles).toEqual([]);
    }
  });

  it('rejects invalid crossword levels, dimensions, asymmetric blocks and short entries', () => {
    const easy = readGameSampleFiles('cueword').find((item) =>
      (item.data as { level?: string } | null)?.level === 'easy')!.data as {
        status: string; level: string; grid: string[]; clues: unknown;
      };
    const badSymmetry = [...easy.grid];
    badSymmetry[0] = badSymmetry[0]!.slice(0, 1) + '.' + badSymmetry[0]!.slice(2);
    const shortEntries = [...easy.grid];
    shortEntries[0] = '.AB..';
    shortEntries[shortEntries.length - 1] = '..ST.';
    const malformed = [
      { ...easy, level: 'hard' },
      { ...easy, level: 'expert' },
      { ...easy, grid: badSymmetry },
      { ...easy, grid: shortEntries },
    ];
    for (const data of malformed) {
      expect(() => parseCrossword({ id: 'sample-01', sample: true, ...data })).toThrow();
      const report = analyzePuzzleRunway('cueword', [{ name: 'sample-01.json', data }], at(1));
      expect(report.invalidFiles).toContain('sample-01.json');
      expect(report.daysLeft).toBe(0);
    }
  });
  it('rejects malformed word paths before counting a playable day', () => {
    const filename = 'sample-01.json';
    const malformed = [
      { status: 'sample', grid: ['ABC'], words: [{ answer: 'ABC' }] },
      { status: 'sample', grid: ['CAT', 'DOG', 'SUN'], words: [
        { answer: 'CAT', path: [[0, 0], [0, 1]] },
        { answer: 'DOG', path: [[1, 0], [1, 1], [1, 2]] },
        { answer: 'SUN', path: [[2, 0], [2, 1], [2, 2]] },
      ] },
    ];
    for (const data of malformed) {
      expect(() => parseWordPath({ id: 'sample-01', sample: true, grid: data.grid, words: data.words })).toThrow();
      const report = analyzePuzzleRunway('suture', [{ name: filename, data }], at(1));
      expect(report.invalidFiles).toContain(filename);
      expect(report.daysLeft).toBe(0);
    }
  });

  it('agrees with the actual game parsers on all tracked crossword and word-path samples', () => {
    for (const game of ['cueword', 'suture'] as const) {
      const samples = readGameSampleFiles(game);
      expect(samples.length).toBeGreaterThan(0);
      for (const sample of samples) {
        const data = sample.data as Record<string, unknown>;
        const puzzle = { id: sample.name.slice(0, -5), sample: true, ...data };
        if (game === 'cueword') expect(() => parseCrossword(puzzle)).not.toThrow();
        else expect(() => parseWordPath(puzzle)).not.toThrow();
        expect(analyzePuzzleRunway(game, [sample], at(1)).invalidFiles, sample.name).toEqual([]);
      }
    }
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
    expect(reports.map((row) => row.game)).toEqual(['pulse', 'cueword-easy', 'cueword-mid', 'cueword-hard', 'sudoku', 'suture', 'triage']);
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

  it('counts each selectable crossword difficulty, not six unused legacy puzzles', () => {
    const all = readGameSampleFiles('cueword');
    const selected = (level: 'easy' | 'mid' | 'hard') => all.filter((file) =>
      (file.data as { level?: string } | null)?.level === level);
    const reports = puzzleRunways(at(1));
    const levelReports = reports.filter((report) => report.game.startsWith('cueword-'));
    expect(levelReports.map((report) => report.game)).toEqual(['cueword-easy', 'cueword-mid', 'cueword-hard']);
    expect(levelReports.map((report) => report.sampleCount)).toEqual(
      (['easy', 'mid', 'hard'] as const).map((level) => selected(level).length));
    expect(levelReports.map((report) => report.daysLeft)).toEqual(levelReports.map((report) => report.sampleCount));
    expect(levelReports.reduce((sum, report) => sum + report.sampleCount, 0)).toBe(
      all.filter((file) => (file.data as { level?: string } | null)?.level !== undefined).length);
    for (const report of levelReports) {
      expect(report.sampleCount).toBeGreaterThan(0);
      expect(report.gaps).toEqual([]);
      expect(report.invalidFiles).toEqual([]);
    }
    // The independent pools restart after their own lengths, not after all file names.
    const after = puzzleRunways(at(Math.max(...levelReports.map((report) => report.sampleCount)) + 1));
    expect(after.filter((report) => report.game.startsWith('cueword-')).map((report) => report.daysLeft))
      .toEqual([0, 0, 0]);
  });

  it('uses pool positions rather than global numeric filenames after filtering by level', () => {
    const sample = readGameSampleFiles('cueword').find((file) =>
      (file.data as { level?: string } | null)?.level === 'easy')!;
    const data = sample.data as { level: string; grid: string[]; clues: unknown; status: string };
    const alternate = { ...data, grid: data.grid.map((row) => row.replace(/[A-Z]/g, (letter) => letter === 'Z' ? 'Y' : 'Z')) };
    const one = { name: 'sample-07.json', data };
    const two = { name: 'sample-10.json', data: alternate };
    const report = analyzePuzzleRunway('cueword', [one, two], at(1), 'position');
    expect(report).toMatchObject({ sampleCount: 2, daysLeft: 2 });
    expect(report.gaps).toEqual([]);
    expect(report.outOfOrder).toEqual([]);
    expect(report.repeats).toEqual([]);
    const repeated = analyzePuzzleRunway('cueword', [one, { name: two.name, data }], at(1), 'position');
    expect(repeated.repeats).toEqual([{ firstDay: '2026-11-01', repeatedDay: '2026-11-02' }]);
    expect(repeated.daysLeft).toBe(1);
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
    expect(lines).toHaveLength(7);
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
