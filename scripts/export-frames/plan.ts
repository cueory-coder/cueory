import { parseArgs } from 'node:util';

export class PlanError extends Error {}

export interface ExportOptions {
  url: string;
  selector: string;
  out: string;
  fps: number;
  seconds?: number;
}

export const FRAME_SIZES = [
  { name: 'portrait', width: 1080, height: 1920 },
  { name: 'landscape', width: 1920, height: 1080 },
] as const;

/**
 * Styles that stretch the selected element over the whole window before capture, so every frame is exactly the
 * frame size whatever size the diagram is drawn at (an SVG with a viewBox scales to fit). The rest of the page is
 * hidden, so only the page's background shows around the diagram. They are set through the CSSOM, which the site's
 * content security policy allows, and only in the exporter's own browser.
 */
export const FILL_STYLE: Readonly<Record<string, string>> = {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  'max-width': 'none',
  'max-height': 'none',
  margin: '0',
  'box-sizing': 'border-box',
  'z-index': '2147483647',
  visibility: 'visible',
};

/** The width and height written in a PNG's header (the IHDR chunk), or undefined when it isn't a PNG. */
export function pngSize(png: Uint8Array): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || signature.some((byte, i) => png[i] !== byte)) return undefined;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function numeric(value: string, name: string, min: number, max: number): number {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number < min || number > max) {
    throw new PlanError(`${name} must be a number from ${min} to ${max}.`);
  }
  return number;
}

export function parseArguments(args: readonly string[]): ExportOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: false,
      strict: true,
      tokens: true,
      options: {
        url: { type: 'string' },
        selector: { type: 'string' },
        out: { type: 'string' },
        fps: { type: 'string' },
        seconds: { type: 'string' },
      },
    });
  } catch {
    throw new PlanError('Use --url, --selector and --out, with optional --fps and --seconds values.');
  }
  const seen = new Set<string>();
  for (const token of parsed.tokens ?? []) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name)) throw new PlanError(`Give --${token.name} only once.`);
    seen.add(token.name);
  }
  const required = (name: string): string => {
    const value = parsed.values[name];
    if (typeof value !== 'string' || !value.trim()) throw new PlanError(`--${name} is required.`);
    return value;
  };
  const url = required('url');
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error();
  } catch {
    throw new PlanError('--url must be a full http:// or https:// page address.');
  }
  return {
    url,
    selector: required('selector'),
    out: required('out'),
    fps: numeric(typeof parsed.values.fps === 'string' ? parsed.values.fps : '30', '--fps', 1, 60),
    ...(typeof parsed.values.seconds === 'string'
      ? { seconds: numeric(parsed.values.seconds, '--seconds', 0, 60) }
      : {}),
  };
}

/** AnimationEffect.getComputedTiming().endTime is measured in milliseconds. */
export function durationMs(endTimes: readonly number[], seconds?: number): number {
  if (seconds !== undefined) return numeric(String(seconds), '--seconds', 0, 60) * 1000;
  if (endTimes.some((end) => !Number.isFinite(end))) {
    throw new PlanError('An animation repeats forever; give --seconds from 0 to 60.');
  }
  return Math.min(60_000, Math.max(0, ...endTimes));
}

export function frameTimes(duration: number, fps: number): number[] {
  numeric(String(duration), 'The duration in milliseconds', 0, 60_000);
  numeric(String(fps), '--fps', 1, 60);
  const times: number[] = [];
  for (let frame = 0; (frame * 1000) / fps < duration; frame++) times.push((frame * 1000) / fps);
  return times;
}

/** Frame indexes are zero-based; exported file names begin at 00001.png. */
export function frameName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 99_999) {
    throw new PlanError('The frame number must be a whole number from 1 to 99999.');
  }
  return `${String(index + 1).padStart(5, '0')}.png`;
}
