/** Pure logic for share achievements (Task 103, D-pending). No personal data in share images or text. */

export const SHARE_STYLES = ['scene', 'ivory', 'bronze-coin'] as const;
export type ShareStyle = typeof SHARE_STYLES[number];

export const GAME_IDS = ['pulse', 'cueword', 'triage', 'suture'] as const;
export type GameId = typeof GAME_IDS[number];
export type ShareToolId = GameId | 'study';

/** Human-readable label for each card style. */
export const STYLE_LABELS: Record<ShareStyle, string> = {
  scene: 'scene',
  ivory: 'editorial',
  'bronze-coin': 'coin',
};

/** Scene background color per tool group (brand spec, not in design tokens: used only for share cards). */
export const SCENE_COLORS: Record<ShareToolId, string> = {
  pulse: '#4a0e0e',
  cueword: '#4a0e0e',
  triage: '#4a0e0e',
  suture: '#4a0e0e',
  study: '#051f20',
};

/** The page a share link always points to. */
export const TOOL_PATHS: Record<ShareToolId, string> = {
  pulse: '/play',
  cueword: '/play',
  triage: '/play',
  suture: '/play',
  study: '/learn/study-skills',
};

/** Display name used in share copy. */
export const TOOL_DISPLAY: Record<ShareToolId, string> = {
  pulse: 'pulse',
  cueword: 'crossword',
  triage: 'triage',
  suture: 'word path',
  study: 'study skills',
};

/** Path to the static share card image for a tool × style (nothing personal). */
export function shareImagePath(tool: ShareToolId, style: ShareStyle): string {
  const group = tool === 'study' ? 'study' : 'games';
  return `/share/${group}-${style}.png`;
}

/** Absolute URL of the tool page the share link points to. */
export function buildShareUrl(tool: ShareToolId, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}${TOOL_PATHS[tool]}`;
}

/** Short share copy (no personal data). */
export function buildShareText(tool: ShareToolId): string {
  return `I'm studying with ${TOOL_DISPLAY[tool]} on Cueory`;
}

/** Whether the Web Share API (with file attachment) is available. */
export function canShareFiles(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([], 'test.png', { type: 'image/png' })] })
  );
}

/** Whether the basic Web Share API (URL + text) is available. */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** X/Twitter intent URL for sharing text + URL. */
export function xIntentUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text: `${text}\n${url}` });
  return `https://x.com/intent/tweet?${params}`;
}
