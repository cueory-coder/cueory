/** Pure, level palm-text layout. The caller supplies its own font measurement. */
export interface PalmBox { width: number; height: number }
export interface PalmText { lines: string[]; fontPx: number }
export interface PalmTextOptions {
  minPx?: number;
  maxPx?: number;
  /** Line height as a font-size multiplier, for example 1.15. */
  lineHeight?: number;
}

type Measure = (text: string, fontPx: number) => number;
interface Wrap { lines: string[]; widow: boolean; slack: number }
const positive = (n: number) => Number.isFinite(n) && n > 0;

/** Find a wrap, preferring no one-word last line, then the least ragged layout. */
function wrapAt(words: string[], box: PalmBox, measure: Measure, fontPx: number, lineHeight: number): PalmText | null {
  const maxLines = Math.min(words.length, Math.floor(box.height / (fontPx * lineHeight)));
  if (maxLines < 1) return null;
  const widths = new Map<string, number>();
  const width = (line: string) => {
    if (!widths.has(line)) widths.set(line, measure(line, fontPx));
    return widths.get(line)!;
  };
  if (words.some(word => !Number.isFinite(width(word)) || width(word) < 0 || width(word) > box.width)) return null;
  const memo = new Map<string, Wrap | null>();
  function visit(start: number, left: number): Wrap | null {
    if (start === words.length) return { lines: [], widow: false, slack: 0 };
    if (left === 0) return null;
    const key = `${start}:${left}`;
    if (memo.has(key)) return memo.get(key)!;
    let best: Wrap | null = null;
    for (let end = start + 1; end <= words.length; end++) {
      const line = words.slice(start, end).join(' ');
      const measured = width(line);
      if (!Number.isFinite(measured) || measured < 0 || measured > box.width) continue;
      const rest = visit(end, left - 1);
      if (!rest) continue;
      const candidate: Wrap = {
        lines: [line, ...rest.lines],
        widow: rest.widow || (start > 0 && end === words.length && end - start === 1),
        slack: rest.slack + (box.width - measured) ** 2,
      };
      if (!best || (best.widow && !candidate.widow)
        || (best.widow === candidate.widow && candidate.slack < best.slack)) best = candidate;
    }
    memo.set(key, best);
    return best;
  }
  const result = visit(0, maxLines);
  return result ? { lines: result.lines, fontPx } : null;
}

/**
 * Fit on a half-pixel size grid starting at minPx (also trying maxPx exactly).
 * As with a fixed browser font, measure must give nondecreasing widths as fontPx grows.
 * Text wraps at ordinary spaces only; words are never split. No browser APIs are used.
 */
export function fitPalmText(
  text: string, box: PalmBox, measure: Measure, options: PalmTextOptions = {},
): PalmText | null {
  const { minPx = 16, maxPx = 32, lineHeight = 1.15 } = options;
  if (typeof text !== 'string' || !text.trim() || !positive(box.width) || !positive(box.height)
    || !positive(minPx) || !positive(maxPx) || maxPx < minPx || !positive(lineHeight)) return null;
  const words = text.trim().split(/ +/u);
  const at = (size: number) => wrapAt(words, box, measure, size, lineHeight);
  let best = at(minPx);
  if (!best) return null;
  const fullSize = at(maxPx);
  if (fullSize) return fullSize;
  // A line must fit vertically even before considering its width.
  const upper = Math.min(maxPx, box.height / lineHeight);
  let low = 1;
  let high = Math.floor((upper - minPx) * 2);
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const result = at(minPx + middle / 2);
    if (result) {
      best = result;
      low = middle + 1;
    } else high = middle - 1;
  }
  return best;
}
