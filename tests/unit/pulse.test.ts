import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyGames, forbiddenGameWords } from '../../src/config/games';
import {
  cleanGuess,
  dayNumber,
  GUESSES,
  guessesLeft,
  guessInWords,
  guessProblem,
  letterMarks,
  MARK_SYMBOL,
  markGuess,
  playGuess,
  puzzleForDay,
  shareText,
  startPulse,
} from '../../src/islands/pulse';

describe('daily games (task-114)', () => {
  it("lists the four games with pillo's new name, lowercase, all playable", () => {
    expect(dailyGames.map((game) => game.name)).toEqual(['pillo', 'crossword', 'sort', 'word path']);
    expect(dailyGames.map((game) => game.id)).toEqual(['pulse', 'cueword', 'triage', 'suture']);
    expect(dailyGames.filter((game) => game.ready).map((game) => game.id)).toEqual(['pulse', 'cueword', 'triage', 'suture']);
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
      '../../src/islands/CuewordGame.tsx',
      '../../src/islands/CuewordToday.tsx',
      '../../src/islands/cueword.ts',
      '../../src/islands/SutureGame.tsx',
      '../../src/islands/SutureToday.tsx',
      '../../src/islands/suture.ts',
      '../../src/components/DailyGamesSection.astro',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));
    const named = (text: string) =>
      forbiddenGameWords.filter((word) => new RegExp(`\\b${word}\\b`).test(text.toLowerCase()));
    for (const file of files.slice(1)) expect(named(file)).toEqual([]);
    // The settings name them only in the list of words to avoid.
    expect(named(files[0]!.split('forbiddenGameWords')[0]!)).toEqual([]);
  });

  it('keeps pulse puzzles as labeled samples with five-letter words', () => {
    const folder = new URL('../../content/games/pulse/', import.meta.url);
    const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const name of files) {
      const puzzle = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
      expect(name).toMatch(/^sample-\d{2}\.json$/);
      expect(puzzle.status).toBe('sample');
      // pillo uses five-letter words (task-114); puzzles retain a cue field for content compatibility
      expect(puzzle.word).toMatch(/^[a-z]{5}$/);
    }
  });
});

describe('pillo (task-114)', () => {
  it('marks letters in place, elsewhere in the word, or not in it', () => {
    // notes vs tones: o(1)=here, e(3)=here, s(4)=here; n and t are elsewhere.
    expect(markGuess('notes', 'tones')).toEqual(['elsewhere', 'here', 'elsewhere', 'here', 'here']);
    expect(markGuess('tones', 'tones')).toEqual(Array(5).fill('here'));
  });

  it('never gives a doubled letter more marks than the word has copies', () => {
    // One "s" in "music", and it is in place: the guess's other two are not in the word.
    expect(markGuess('sissy', 'music')).toEqual(['absent', 'elsewhere', 'here', 'absent', 'absent']);
    // Two "l"s in "hello", neither in place: both of the guess's are elsewhere.
    expect(markGuess('llama', 'hello')).toEqual(['elsewhere', 'elsewhere', 'absent', 'absent', 'absent']);
    // A letter in place takes its copy first; an earlier copy is elsewhere only while another copy is left.
    expect(markGuess('allot', 'hello')).toEqual(['absent', 'elsewhere', 'here', 'elsewhere', 'absent']);
  });

  it('has six guesses and ends when they run out', () => {
    expect(GUESSES).toBe(6);
    let state = startPulse('tones');
    expect(guessesLeft(state)).toBe(6);
    state = playGuess(state, 'stone');
    expect(guessesLeft(state)).toBe(5);
    for (const word of ['crane', 'black', 'drips', 'vapor', 'jumpy']) state = playGuess(state, word);
    expect(state.status).toBe('out');
    expect(playGuess(state, 'tones')).toBe(state);
  });

  it('is solved by the word itself, and a guess that is the wrong length or not letters changes nothing', () => {
    let state = startPulse('tones');
    expect(playGuess(state, 'tone')).toBe(state);
    expect(guessProblem('tone', 5)).toBe('the word has 5 letters.');
    expect(guessProblem('t0nes', 5)).toBe('use letters only.');
    expect(cleanGuess(' Ton-es ')).toBe('tones');
    state = playGuess(state, 'TONES');
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
    // notes: o=here, e=here, s=here, n=elsewhere, t=elsewhere
    // crane (vs tones): c=absent, r=absent, a=absent, n=elsewhere, e=elsewhere
    // combined: o=here, e=here (here beats elsewhere), s=here, n=elsewhere, c=absent
    const state = playGuess(playGuess(startPulse('tones'), 'notes'), 'crane');
    const marks = letterMarks(state.guesses);
    expect(marks.get('o')).toBe('here');
    expect(marks.get('e')).toBe('here');
    expect(marks.get('c')).toBe('absent');
    expect(marks.has('z')).toBe(false);
  });

  it('shares the result as plain words: no colored squares, no grid', () => {
    let state = playGuess(startPulse('tones'), 'stone');
    state = playGuess(state, 'tones');
    const line = shareText(state, 'sun 1 nov');
    expect(line).toBe('cueory pillo, sun 1 nov: solved in 2 of 6.');
    expect(line).toMatch(/^[\x20-\x7e]+$/);
    let lost = startPulse('tones');
    for (let i = 0; i < 6; i++) lost = playGuess(lost, 'crane');
    expect(shareText(lost, 'sun 1 nov')).toBe('cueory pillo, sun 1 nov: not solved.');
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
