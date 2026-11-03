import { describe, expect, it } from 'vitest';
import { dailyGames, gameName } from '../../src/config/games';
import { dayLabel } from '../../src/islands/daily';
import { shareLine as crosswordShare } from '../../src/islands/cueword';
import { GUESSES, playGuess, shareText as pilloShare, startPulse } from '../../src/islands/pulse';
import { shareLine as wordPathShare, type SutureState } from '../../src/islands/suture';
import { triageShareText, type TriageState } from '../../src/islands/triage';

// Exercise every result branch, including singular/plural counts. No puzzle answer or letter grid belongs in a share.
const won = playGuess(startPulse('tones'), 'tones');
let lost = startPulse('tones');
for (let turn = 0; turn < GUESSES; turn++) lost = playGuess(lost, 'crane');

const wordPath = (found: number[], misses: number): SutureState => ({
  anchor: null, cursor: null, found, misses, totalWords: 3,
});
const sorted = (slips: number): TriageState => ({
  terms: ['sample'], placed: { sample: 0 }, slips, status: 'sorted',
});
const out: TriageState = { terms: ['sample'], placed: {}, slips: 3, status: 'out' };

const shares: Record<string, Array<(day: string) => string>> = {
  pulse: [
    (day) => pilloShare(won, day),
    (day) => pilloShare(lost, day),
  ],
  cueword: [
    (day) => crosswordShare({ solved: true, seconds: 252, cues: 0 }, day, gameName('cueword')),
    (day) => crosswordShare({ solved: true, seconds: 252, cues: 1 }, day, gameName('cueword')),
    (day) => crosswordShare({ solved: false, seconds: 252, cues: 3 }, day, gameName('cueword')),
  ],
  triage: [
    ...[0, 1, 2].map((slips) => (day: string) => triageShareText(sorted(slips), day)),
    (day) => triageShareText(out, day),
  ],
  suture: [
    (day) => wordPathShare(wordPath([], 0), day, gameName('suture')),
    (day) => wordPathShare(wordPath([0], 1), day, gameName('suture')),
    (day) => wordPathShare(wordPath([0, 1, 2], 2), day, gameName('suture')),
  ],
};

const dates = [new Date(2026, 0, 1, 12), new Date(2026, 10, 3, 12), new Date(2028, 1, 29, 12)];

describe('all /play game shares use plain one-line words (Task 229)', () => {
  it('covers every game in the lobby', () => {
    expect(Object.keys(shares).sort()).toEqual(dailyGames.map((game) => game.id).sort());
  });

  for (const game of dailyGames) {
    it.each(dates)('%s: ' + game.id + ' never shares an emoji grid or colored squares', (date) => {
      const day = dayLabel(date);
      for (const result of shares[game.id]!) {
        const line = result(day);
        // Printable ASCII rejects colored squares, emoji, decorative grid symbols, newlines and invisible controls.
        expect(line).toMatch(/^[\x20-\x7e]+$/);
        expect(line).toBe(line.trim());
        expect(line).toBe(line.toLowerCase());
        expect(line.startsWith(`cueory ${game.name}, ${day}: `)).toBe(true);
        expect(line.slice(line.indexOf(': ') + 2)).toMatch(/[a-z]{2,}/);
        expect(line).not.toContain('tones');
        expect(line).not.toContain('crane');
      }
    });
  }
});
