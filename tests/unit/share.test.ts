import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { dailyGames, gameName } from '../../src/config/games';
import {
  buildShareData,
  buildShareText,
  buildShareUrl,
  canNativeShare,
  canShareFiles,
  centeredScrollLeft,
  GAME_IDS,
  loadCardFile,
  runShare,
  shareFileOrCopy,
  scrollBehavior,
  SHARE_STYLES,
  shareFileName,
  shareImagePath,
  STYLE_LABELS,
  TOOL_PATHS,
  toolName,
  xIntentUrl,
  type ShareTarget,
  type ShareToolId,
} from '../../src/islands/share';

/** Task 103: sharing achievements. */
const SITE = 'https://cueory.app';
const TOOLS: ShareToolId[] = [...GAME_IDS, 'study'];
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const png = (name = 'card.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
const base = { title: 'cueory', text: 'text', url: `${SITE}/play#pulse-heading` };

describe('share links go to the exact tool', () => {
  it('covers every daily game in the settings', () => {
    expect([...GAME_IDS].sort()).toEqual(dailyGames.map((game) => game.id).sort());
  });

  it("points each game at its own section of /play, using heading ids the page really has", () => {
    const play = read('src/pages/play.astro');
    for (const id of GAME_IDS) {
      const [path, anchor] = TOOL_PATHS[id].split('#');
      expect(path).toBe('/play');
      expect(play).toContain(`id="${anchor}"`);
      expect(buildShareUrl(id, SITE)).toBe(`${SITE}/play#${anchor}`);
    }
    expect(new Set(GAME_IDS.map((id) => TOOL_PATHS[id])).size).toBe(GAME_IDS.length);
  });

  it('points study skills at its page', () => {
    expect(buildShareUrl('study', SITE)).toBe(`${SITE}/learn/study-skills`);
  });

  it('strips a trailing slash and never adds tracking parameters', () => {
    expect(buildShareUrl('pulse', `${SITE}/`)).toBe(`${SITE}/play#pulse-heading`);
    for (const tool of TOOLS) expect(new URL(buildShareUrl(tool, SITE)).search).toBe('');
  });
});

describe('names come from src/config/games.ts (D-66, D-67)', () => {
  it('uses gameName() for every game, never a second list', () => {
    for (const game of dailyGames) {
      expect(toolName(game.id)).toBe(gameName(game.id));
      expect(buildShareText(game.id)).toContain(gameName(game.id));
    }
  });

  it('never shows an internal id that differs from the visible name', () => {
    for (const game of dailyGames) {
      if (game.id === game.name) continue;
      expect(buildShareText(game.id)).not.toMatch(new RegExp(`\\b${game.id}\\b`));
    }
  });

  it('writes the share line in lowercase with nothing personal in it', () => {
    for (const tool of TOOLS) {
      const text = buildShareText(tool);
      expect(text).toBe(text.toLowerCase());
      expect(text).not.toMatch(/\d|@/);
    }
  });
});

describe('card images', () => {
  it('maps games to the games cards and study to its own', () => {
    for (const style of SHARE_STYLES) {
      for (const id of GAME_IDS) expect(shareImagePath(id, style)).toBe(`/share/games-${style}.png`);
      expect(shareImagePath('study', style)).toBe(`/share/study-${style}.png`);
      expect(shareFileName('study', style)).toBe(`cueory-study-${style}.png`);
      expect(STYLE_LABELS[style].length).toBeGreaterThan(0);
    }
  });

  it.each(SHARE_STYLES.flatMap((style) => ['games', 'study'].map((group) => `${group}-${style}`)))(
    '%s.png is a 1200×630 PNG carrying the official logo artwork',
    async (name) => {
      const file = new URL(`../../public/share/${name}.png`, import.meta.url);
      const image = sharp(readFileSync(file));
      const meta = await image.metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
      // The logo sits in the top-left box. Its solid pixels are the logo's exact color: Espresso on the ivory card,
      // Ivory on the dark ones (BRAND.md: never recolored).
      const ink = name.endsWith('-ivory') ? [62, 44, 35] : [249, 245, 239];
      const { data, info } = await image
        .extract({ left: 72, top: 64, width: 240, height: 76 })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let solid = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (data[i] === ink[0] && data[i + 1] === ink[1] && data[i + 2] === ink[2]) solid++;
      }
      expect(solid).toBeGreaterThan(1500);
    },
  );

  it('builds the cards from the official logo files, never typing the name in a font', () => {
    const script = read('scripts/build-share-cards.mjs');
    expect(script).toContain('public/brand/v1/logo-full-dark-960.png');
    expect(script).toContain('public/brand/v1/logo-full-light-960.png');
    expect(script).not.toMatch(/>\s*cueory\s*</i);
    expect(script).not.toMatch(/opacity[^;\n]*logo|logo[^;\n]*opacity/i);
  });
});

describe('X post link', () => {
  it('is a plain x.com/intent/post link with the text and the link as their own parameters', () => {
    const url = new URL(xIntentUrl("i'm studying with sort on cueory.", `${SITE}/play#triage-heading`));
    expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
    expect(url.searchParams.get('text')).toBe("i'm studying with sort on cueory.");
    expect(url.searchParams.get('url')).toBe(`${SITE}/play#triage-heading`);
  });
});

describe('native share', () => {
  it('shares the selected card image with the text and link when the browser can share that file', () => {
    const file = png('cueory-games-ivory.png');
    const canShare = vi.fn(() => true);
    const data = buildShareData({ share: vi.fn(), canShare }, base, file);
    expect(data).toEqual({ ...base, files: [file] });
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
  });

  it('falls back to the text and link when files cannot be shared or the image did not load', () => {
    const file = png();
    expect(buildShareData({ share: vi.fn(), canShare: () => false }, base, file)).toEqual(base);
    expect(buildShareData({ share: vi.fn() }, base, file)).toEqual(base);
    expect(buildShareData({ share: vi.fn(), canShare: () => true }, base, null)).toEqual(base);
  });

  const fileUnsupportedTargets: readonly [string, ShareTarget][] = [
    ['missing capability', { share: vi.fn() }],
    ['false capability', { share: vi.fn(), canShare: (): boolean => false }],
    ['throwing capability', { share: vi.fn(), canShare: (): boolean => { throw new Error('no'); } }],
  ];

  it.each(fileUnsupportedTargets)('copies the exact line when file sharing has %s', async (_case, target) => {
    const copy = vi.fn(async () => undefined);
    await expect(shareFileOrCopy(target, base, png(), copy)).resolves.toBe('copied');
    expect(copy).toHaveBeenCalledOnce();
    expect(copy).toHaveBeenCalledWith(base.text);
    expect(target.share).not.toHaveBeenCalled();
  });

  it('never throws when canShare rejects the supplied file', () => {
    const target: ShareTarget = { share: vi.fn(), canShare: () => { throw new Error('no'); } };
    expect(buildShareData(target, base, png())).toEqual(base);
  });

  it('never throws: a closed sheet is "cancelled", other errors are "failed"', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    await expect(runShare({ share: () => Promise.resolve() }, base)).resolves.toBe('shared');
    await expect(runShare({ share: () => Promise.reject(abort) }, base)).resolves.toBe('cancelled');
    await expect(runShare({ share: () => Promise.reject(new Error('NotAllowedError')) }, base)).resolves.toBe('failed');
    await expect(runShare({ share: () => Promise.reject(null) }, base)).resolves.toBe('failed');
    await expect(runShare({}, base)).resolves.toBe('unavailable');
  });

  it('detects the Web Share API and file sharing without throwing', () => {
    const throwing: ShareTarget = {
      share: vi.fn(),
      canShare: () => {
        throw new Error('no');
      },
    };
    expect(canNativeShare(undefined)).toBe(false);
    expect(canNativeShare({ share: vi.fn() })).toBe(true);
    expect(canShareFiles({ share: vi.fn() })).toBe(false);
    expect(canShareFiles({ canShare: () => true })).toBe(false);
    expect(canShareFiles({ share: vi.fn(), canShare: () => true })).toBe(true);
    expect(canShareFiles(throwing)).toBe(false);
  });

  it('loads a card as an image/png File, or null when the request fails', async () => {
    const ok = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const file = await loadCardFile(ok as unknown as typeof fetch, '/share/games-scene.png', 'cueory-games-scene.png');
    expect(ok).toHaveBeenCalledWith('/share/games-scene.png');
    expect([file?.name, file?.type, file?.size]).toEqual(['cueory-games-scene.png', 'image/png', 3]);
    const missing = vi.fn(async () => new Response('', { status: 404 }));
    expect(await loadCardFile(missing as unknown as typeof fetch, '/x.png', 'x.png')).toBeNull();
    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await loadCardFile(offline as unknown as typeof fetch, '/x.png', 'x.png')).toBeNull();
  });
});

describe('scrolling the card row', () => {
  it('scrolls instantly under reduced motion and smoothly otherwise', () => {
    const media = (reduce: boolean) => (query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
    });
    expect(scrollBehavior(media(true))).toBe('auto');
    expect(scrollBehavior(media(false))).toBe('smooth');
    expect(scrollBehavior(undefined)).toBe('smooth');
    expect(
      scrollBehavior(() => {
        throw new Error('no');
      }),
    ).toBe('auto');
  });

  it('centers a card in the row and never scrolls before the start', () => {
    expect(centeredScrollLeft({ clientWidth: 300 }, { offsetLeft: 316, offsetWidth: 280 })).toBe(306);
    expect(centeredScrollLeft({ clientWidth: 300 }, { offsetLeft: 16, offsetWidth: 280 })).toBe(6);
    expect(centeredScrollLeft({ clientWidth: 600 }, { offsetLeft: 16, offsetWidth: 280 })).toBe(0);
  });
});
