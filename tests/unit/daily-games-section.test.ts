import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyGames, statGame } from '../../src/config/games';

// The verify script builds dist/ before unit tests, so these assertions check the actual visitor-facing HTML.
const html = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');

function gamesSection(): string {
  const section = html.match(/<section\b(?=[^>]*\bid="daily-games")[^>]*>[\s\S]*?<\/section>/)?.[0];
  if (!section) throw new Error('the built home page is missing #daily-games');
  return section;
}

function summaryText(): string {
  const markup = gamesSection().match(/<p\b(?=[^>]*\bdata-testid="daily-games-summary")[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if (markup === undefined) throw new Error('the built home page is missing the daily games summary');
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('home daily games summary', () => {
  it('names all ready games from the shared config and the separate stat preview', () => {
    const summary = summaryText();
    const readyNames = dailyGames.filter((game) => game.ready).map((game) => game.name);
    const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(readyNames);

    expect(summary).toContain(list);
    for (const name of readyNames) expect(summary).toContain(name);
    for (const game of dailyGames.filter((game) => !game.ready)) expect(summary).not.toContain(game.name);
    expect(summary).toContain(`${statGame.name} is in preview`);
    expect(summary).not.toMatch(/\bsort\b/i);
    expect(summary).toBe(summary.toLowerCase());
  });

  it('keeps the single call to action on /play, without a direct stat link', () => {
    const section = gamesSection();
    const links = [...section.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)].map((match) => match[1]);
    expect(links).toEqual(['/play']);
    expect(section).toContain('data-testid="games-link"');
  });
});
