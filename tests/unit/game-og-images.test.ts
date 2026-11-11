import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { GAME_OG_IMAGES } from '../../src/islands/share';

describe('static game Open Graph previews', () => {
  it('gives every results-card game a distinct stable file', () => {
    expect(Object.keys(GAME_OG_IMAGES).sort()).toEqual(['cueword', 'hello-cards', 'pulse', 'sudoku', 'suture']);
    expect(new Set(Object.values(GAME_OG_IMAGES)).size).toBe(5);
  });

  it.each(Object.entries(GAME_OG_IMAGES))('%s is a 1200 by 630 PNG', async (_game, path) => {
    const image = sharp(readFileSync(new URL(`../../public${path}`, import.meta.url)));
    const meta = await image.metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
  });

  it('sets each crawlable game route to its own preview', () => {
    const routes = {
      pulse: 'src/pages/play/pillo.astro',
      cueword: 'src/pages/play/crossword.astro',
      suture: 'src/pages/play/word-path.astro',
      sudoku: 'src/pages/play/sudoku.astro',
      'hello-cards': 'src/pages/play/hello-cards.astro',
    } as const;
    for (const [game, file] of Object.entries(routes)) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      if (game === 'hello-cards') expect(source).toContain('/share/hello-cards-og.png');
      else expect(source.includes(`GAME_OG_IMAGES['${game}']`) || source.includes(`GAME_OG_IMAGES.${game}`)).toBe(true);
    }
  });
});
