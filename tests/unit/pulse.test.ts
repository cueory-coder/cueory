import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyGames, forbiddenGameWords } from '../../src/config/games';
import {
  BEATS,
  beatsLeft,
  canTakeCue,
  cleanGuess,
  dayNumber,
  guessInWords,
  guessProblem,
  letterMarks,
  MARK_SYMBOL,
  markGuess,
  playGuess,
  puzzleForDay,
  shareText,
  startPulse,
  takeCue,
} from '../../src/islands/pulse';

describe('daily games (D-61)', () => {
  it('lists the four games under their working names, lowercase, with pulse and triage playable', () => {
    expect(dailyGames.map((game) => game.name)).toEqual(['pulse', 'cueword', 'triage', 'suture']);
    expect(dailyGames.filter((game) => game.ready).map((game) => game.id)).toEqual(['pulse', 'triage']);
    for (const game of dailyGames) {
      expect(game.name).toBe(game.name.toLowerCase());
      expect(game.line).toBe(game.line.toLowerCase());
    }
  });

  it("never uses another word game's name, on the page, in its settings or in its code", () => {
    const files = [
      '../../src/config/games.ts',
      '../../src/pages/play.astro',
      '../../src/islands/PulseGame.tsx',
      '../../src/islands/pulse.ts',
      '../../src/islands/TriageGame.tsx',
      '../../src/islands/triage.ts',
      '../../src/components/DailyGamesSection.astro',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));
    const named = (text: string) =>
      forbiddenGameWords.filter((word) => new RegExp(`\\b${word}\\b`).test(text.toLowerCase()));
    for (const file of files.slice(1)) expect(named(file)).toEqual([]);
    // The settings name them only in the list of words to avoid.
    expect(named(files[0]!.split('forbiddenGameWords')[0]!)).toEqual([]);
  });

  it('keeps pulse puzzles as labeled samples with everyday words, five to seven letters each', () => {
    const folder = new URL('../../content/games/pulse/', import.meta.url);
    const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const name of files) {
      const puzzle = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
      expect(name).toMatch(/^sample-\d{2}\.json$/);
      expect(puzzle.status).toBe('sample');
      expect(puzzle.word).toMatch(/^[a-z]{5,7}$/);
      expect(puzzle.cue).toBe(puzzle.cue.toLowerCase());
    }
  });
});

describe('pulse (D-61)', () => {
  it('marks letters in place, elsewhere in the word, or not in it', () => {
    expect(markGuess('planet', 'garden')).toEqual(['absent', 'absent', 'elsewhere', 'elsewhere', 'here', 'absent']);
    expect(markGuess('garden', 'garden')).toEqual(Array(6).fill('here'));
  });

  it('never gives a doubled letter more marks than the word has copies', () => {
    // One "s" in "music", and it is in place: the guess's other two are not in the word.
    expect(markGuess('sissy', 'music')).toEqual(['absent', 'elsewhere', 'here', 'absent', 'absent']);
    // Two "l"s in "hello", neither in place: both of the guess's are elsewhere.
    expect(markGuess('llama', 'hello')).toEqual(['elsewhere', 'elsewhere', 'absent', 'absent', 'absent']);
    // A letter in place takes its copy first; an earlier copy is elsewhere only while another copy is left.
    expect(markGuess('allot', 'hello')).toEqual(['absent', 'elsewhere', 'here', 'elsewhere', 'absent']);
  });

  it('has seven beats: each guess spends one, and so does the cue', () => {
    expect(BEATS).toBe(7);
    let state = startPulse('garden');
    expect(beatsLeft(state)).toBe(7);
    state = playGuess(state, 'planet');
    expect(beatsLeft(state)).toBe(6);
    state = takeCue(state);
    expect(state.cueUsed).toBe(true);
    expect(beatsLeft(state)).toBe(5);
    // Only one cue.
    expect(takeCue(state)).toBe(state);
  });

  it('never lets the cue take the last beat, and ends when the beats run out', () => {
    let state = startPulse('garden');
    for (const word of ['planet', 'carton', 'pillow', 'candle', 'lemons', 'basket']) state = playGuess(state, word);
    expect(beatsLeft(state)).toBe(1);
    expect(canTakeCue(state)).toBe(false);
    state = playGuess(state, 'orange');
    expect(state.status).toBe('out');
    expect(playGuess(state, 'garden')).toBe(state);
  });

  it('is solved by the word itself, and a guess that is the wrong length or not letters changes nothing', () => {
    let state = startPulse('garden');
    expect(playGuess(state, 'gard')).toBe(state);
    expect(guessProblem('gard', 6)).toBe('the word has 6 letters.');
    expect(guessProblem('gard3n', 6)).toBe('use letters only.');
    expect(cleanGuess(' Gar-den ')).toBe('garden');
    state = playGuess(state, 'GARDEN');
    expect(state.status).toBe('solved');
  });

  it('says every mark in words, and shows it by a symbol, never by color alone', () => {
    const guess = { word: 'lemon', marks: markGuess('lemon', 'melon') };
    expect(guessInWords(guess)).toBe(
      'l, elsewhere in the word. e, in place. m, elsewhere in the word. o, in place. n, in place.',
    );
    expect(new Set(Object.values(MARK_SYMBOL)).size).toBe(3);
  });

  it('keeps the best mark each letter has had, for the letter buttons', () => {
    const state = playGuess(playGuess(startPulse('garden'), 'planet'), 'carton');
    const marks = letterMarks(state.guesses);
    expect(marks.get('a')).toBe('here');
    expect(marks.get('n')).toBe('here');
    expect(marks.get('p')).toBe('absent');
    expect(marks.has('z')).toBe(false);
  });

  it('shares the result as plain words: no colored squares, no grid', () => {
    let state = playGuess(startPulse('garden'), 'planet');
    state = takeCue(state);
    state = playGuess(state, 'garden');
    const line = shareText(state, 'sun 1 nov');
    expect(line).toBe('cueory pulse, sun 1 nov: solved in 3 of 7 beats, with the cue.');
    expect(line).toMatch(/^[\x20-\x7e]+$/);
    let lost = startPulse('lemon');
    for (let i = 0; i < 7; i++) lost = playGuess(lost, 'apple');
    expect(shareText(lost, 'sun 1 nov')).toBe('cueory pulse, sun 1 nov: not solved this time.');
  });

  it("picks one sample a day from the visitor's own date, going round the list", () => {
    expect(dayNumber(new Date(2026, 10, 1, 0, 5))).toBe(0);
    expect(dayNumber(new Date(2026, 10, 1, 23, 55))).toBe(0);
    expect(dayNumber(new Date(2026, 10, 2, 8))).toBe(1);
    expect(dayNumber(new Date(2027, 0, 1, 12))).toBe(61);
    const list = ['a', 'b', 'c'];
    expect(puzzleForDay(list, 0)).toBe('a');
    expect(puzzleForDay(list, 4)).toBe('b');
    expect(puzzleForDay(list, -1)).toBe('c');
    expect(puzzleForDay([], 3)).toBeUndefined();
  });
});
