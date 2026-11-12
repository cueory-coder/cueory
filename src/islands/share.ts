/**
 * Pure logic for sharing achievements (Task 103, D-pending). Share text, links and card images carry nothing personal:
 * no name, email, puzzle answer or tracking value. Game names come only from src/config/games.ts (D-66, D-67).
 */
import { dailyGames, gameName, type DailyGame } from '../config/games';

export const SHARE_STYLES = ['scene', 'ivory', 'bronze-coin'] as const;
export type ShareStyle = (typeof SHARE_STYLES)[number];

export type GameId = DailyGame['id'];
export const GAME_IDS: readonly GameId[] = dailyGames.map((game) => game.id);
export type ShareToolId = GameId | 'study';

/** The name a student sees for each card style, like Spotify's share sheet (Christian, 2026-11-01). */
export const STYLE_LABELS: Record<ShareStyle, string> = {
  scene: 'scene',
  ivory: 'editorial',
  'bronze-coin': 'coin',
};

/**
 * Where a share link lands: the exact tool it came from. Games point at their own section of /play, using the heading
 * ids that page already gives each game; a unit test checks those ids still exist.
 */
export const TOOL_PATHS: Record<ShareToolId, string> = {
  pulse: '/play#pulse-heading',
  triage: '/play#triage-heading',
  cueword: '/play#crossword-heading',
  suture: '/play#word-path-heading',
  study: '/learn/study-skills',
};

/** The name used in the share line: a game's visible name from the settings, or the study area. */
export function toolName(tool: ShareToolId): string {
  return tool === 'study' ? 'study skills' : gameName(tool);
}

/** Path to the static card image for a tool and style (built by scripts/build-share-cards.mjs). */
export function shareImagePath(tool: ShareToolId, style: ShareStyle): string {
  const group = tool === 'study' ? 'study' : 'games';
  return `/share/${group}-${style}.png`;
}

/** The file name a shared card image gets. */
export function shareFileName(tool: ShareToolId, style: ShareStyle): string {
  return `cueory-${shareImagePath(tool, style).slice('/share/'.length)}`;
}

/** Absolute link to the tool, with no tracking parameters. */
export function buildShareUrl(tool: ShareToolId, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}${TOOL_PATHS[tool]}`;
}

/** The short share line, in the lowercase brand voice for social copy (D-47). Nothing personal. */
export function buildShareText(tool: ShareToolId): string {
  return `i'm studying with ${toolName(tool)} on cueory.`;
}

/** A plain X post link (no SDK, no script): the text and the link as separate parameters. */
export function xIntentUrl(text: string, url: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url })}`;
}

/** The parts of `navigator` that sharing uses, so tests can pass a stand-in. */
export interface ShareTarget {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}

/** Whether the Web Share API is there at all (text and link). */
export function canNativeShare(target: ShareTarget | undefined): boolean {
  return typeof target?.share === 'function';
}

/** Whether this browser can share an image file through the Web Share API. */
export function canShareFile(target: ShareTarget | undefined, file: File): boolean {
  if (!canNativeShare(target) || typeof target?.canShare !== 'function') return false;
  try {
    return target.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function canShareFiles(target: ShareTarget | undefined): boolean {
  return canShareFile(target, new File([new Uint8Array(1)], 'cueory.png', { type: 'image/png' }));
}

/** Fetches a card image and turns it into a File for sharing; null if anything goes wrong. */
export async function loadCardFile(fetcher: typeof fetch, path: string, name: string): Promise<File | null> {
  try {
    const response = await fetcher(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], name, { type: 'image/png' });
  } catch {
    return null;
  }
}

/**
 * What to hand to navigator.share: the selected card's image with the text and link when the browser can share that
 * file, otherwise just the text and link.
 */
export function buildShareData(
  target: ShareTarget,
  base: { title: string; text: string; url: string },
  file: File | null,
): ShareData {
  if (file && canShareFile(target, file)) return { ...base, files: [file] };
  return { ...base };
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable' | 'failed';
export type FileShareOutcome = ShareOutcome | 'copied';

/** Opens the system share sheet. Never throws: closing the sheet is 'cancelled', any other error is 'failed'. */
export async function runShare(target: ShareTarget, data: ShareData): Promise<ShareOutcome> {
  if (typeof target.share !== 'function') return 'unavailable';
  try {
    await target.share(data);
    return 'shared';
  } catch (error) {
    return (error as { name?: unknown } | null)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

/**
 * Shares the result only when this browser accepts the story image. Missing, false or throwing file capability copies
 * the exact approved line instead of opening a text-only system share sheet.
 */
export async function shareFileOrCopy(
  target: ShareTarget,
  base: { title: string; text: string; url: string },
  file: File | null,
  copy: (text: string) => Promise<unknown> | unknown,
): Promise<FileShareOutcome> {
  if (!file || !canShareFile(target, file)) {
    await copy(base.text);
    return 'copied';
  }
  const outcome = await runShare(target, { ...base, files: [file] });
  if (outcome === 'shared' || outcome === 'cancelled') return outcome;
  await copy(base.text);
  return 'copied';
}

/** Instant scrolling when the visitor asked for reduced motion, smooth otherwise. */
export function scrollBehavior(matchMediaFn: ((query: string) => { matches: boolean }) | undefined): ScrollBehavior {
  try {
    return matchMediaFn?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'auto';
  }
}

/** How far to scroll a row so a card sits in its middle (the row must be the card's offset parent). */
export function centeredScrollLeft(row: { clientWidth: number }, card: { offsetLeft: number; offsetWidth: number }): number {
  return Math.max(0, card.offsetLeft - (row.clientWidth - card.offsetWidth) / 2);
}

/** Plain platform share-page links. No SDK, script, tracker or account token is loaded. */
export type SharePlatform = 'facebook' | 'x' | 'threads' | 'reddit' | 'whatsapp';

export function platformShareUrl(platform: SharePlatform, text: string, url: string): string {
  const combined = `${text} ${url}`;
  switch (platform) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url })}`;
    case 'x':
      return xIntentUrl(text, url);
    case 'threads':
      return `https://www.threads.com/intent/post?${new URLSearchParams({ text, url })}`;
    case 'reddit':
      return `https://www.reddit.com/submit?${new URLSearchParams({ url, title: text })}`;
    case 'whatsapp':
      return `https://wa.me/?${new URLSearchParams({ text: combined })}`;
  }
}

export interface StoryImageInput {
  name: string;
  date: string;
  result: string;
  /** Optional approved wordmark asset for a game. */
  wordmarkPath?: string;
}

/** Longest wait for fonts or a logo before the story image gives up and the copy fallback runs. */
export const STORY_ASSET_TIMEOUT_MS = 4000;

/** Settles with the promise, or rejects once `ms` passes, so a stalled asset can never hang the share flow. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const asset = new Image();
    asset.onload = () => resolve(asset);
    asset.onerror = () => reject(new Error('image could not be loaded'));
    asset.src = url;
  });
}

/** Draws the 1080×1920 story card only after the visitor taps share. */
export async function createStoryFile(input: StoryImageInput): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  try {
    const tokens = getComputedStyle(document.documentElement);
    const number = (name: string) => Number.parseFloat(tokens.getPropertyValue(name));
    const page = tokens.getPropertyValue('--color-page').trim();
    const ink = tokens.getPropertyValue('--color-ink').trim();
    const soft = tokens.getPropertyValue('--color-ink-soft').trim();
    const bodyFont = tokens.getPropertyValue('--font-body').trim();
    const displayFont = tokens.getPropertyValue('--font-display').trim();
    const width = number('--share-story-width');
    const height = number('--share-story-height');
    const logoWidth = number('--share-story-logo-width');
    const values = [
      width, height, logoWidth, number('--share-story-logo-top'), number('--share-story-label-y'),
      number('--share-story-result-y'), number('--share-story-challenge-y'), number('--share-story-site-y'),
      number('--share-story-label-size'), number('--share-story-result-size'),
      number('--share-story-challenge-size'), number('--share-story-site-size'),
      number('--share-story-dark-logo'),
    ];
    if (!page || !ink || !soft || !bodyFont || !displayFont || values.some((value) => !Number.isFinite(value))) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    await withTimeout(document.fonts.ready, STORY_ASSET_TIMEOUT_MS);
    context.fillStyle = page;
    context.fillRect(0, 0, width, height);

    // Match the logo ink to the active page palette: Espresso on Ivory, Ivory on Charcoal.
    const logoPath = number('--share-story-dark-logo') === 1 ? '/brand/v1/logo-full-dark-960.png' : '/brand/v1/logo-full-light-960.png';
    const logo = await withTimeout(image(logoPath), STORY_ASSET_TIMEOUT_MS);
    const logoHeight = (logo.height * logoWidth) / logo.width;
    context.drawImage(logo, (width - logoWidth) / 2, number('--share-story-logo-top'), logoWidth, logoHeight);

    if (input.wordmarkPath) {
      const wordmark = await withTimeout(image(input.wordmarkPath), STORY_ASSET_TIMEOUT_MS);
      const wordmarkWidth = logoWidth;
      const wordmarkHeight = (wordmark.height * wordmarkWidth) / wordmark.width;
      context.drawImage(wordmark, (width - wordmarkWidth) / 2, number('--share-story-logo-top') + logoHeight * 2, wordmarkWidth, wordmarkHeight);
    }

    context.textAlign = 'center';
    context.fillStyle = soft;
    context.font = `700 ${number('--share-story-label-size')}px ${bodyFont}`;
    context.fillText(`today's ${input.name} · ${input.date}`, width / 2, number('--share-story-label-y'));

    context.fillStyle = ink;
    context.font = `500 ${number('--share-story-result-size')}px ${displayFont}`;
    context.fillText(input.result, width / 2, number('--share-story-result-y'));

    context.font = `700 ${number('--share-story-challenge-size')}px ${bodyFont}`;
    context.fillText('can you beat me?', width / 2, number('--share-story-challenge-y'));
    context.fillStyle = soft;
    context.font = `400 ${number('--share-story-site-size')}px ${bodyFont}`;
    context.fillText('cueory.app', width / 2, number('--share-story-site-y'));

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], `cueory-${input.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-story.png`, { type: 'image/png' }) : null;
  } catch {
    return null;
  }
}
