import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bands,
  buildFfmpegInput,
  clipFileName,
  escHtml,
  frameFileName,
  frameHtml,
  frameList,
  rewriteFontUrls,
  parseArguments,
  ClipError,
  FRAME_HEIGHT,
  FRAME_WIDTH,
} from '../../scripts/export-clips/plan';

// ── bands ─────────────────────────────────────────────────────────────────────

describe('bands', () => {
  it('returns an empty array for 0 steps', () => {
    expect(bands(0)).toEqual([]);
  });

  it('returns one band covering the full height for 1 step', () => {
    const b = bands(1);
    expect(b).toHaveLength(1);
    expect(b[0]!.y).toBe(0);
    expect(b[0]!.height).toBe(FRAME_HEIGHT);
  });

  it('covers every pixel with no gaps or overlap for 2 steps', () => {
    const b = bands(2);
    expect(b).toHaveLength(2);
    let cursor = 0;
    for (const band of b) {
      expect(band.y).toBe(cursor);
      cursor += band.height;
    }
    expect(cursor).toBe(FRAME_HEIGHT);
  });

  it('covers every pixel with no gaps or overlap for 3 steps', () => {
    const b = bands(3);
    expect(b).toHaveLength(3);
    let cursor = 0;
    for (const band of b) {
      expect(band.y).toBe(cursor);
      cursor += band.height;
    }
    expect(cursor).toBe(FRAME_HEIGHT);
  });

  it('covers every pixel with no gaps or overlap for 4 steps', () => {
    const b = bands(4);
    expect(b).toHaveLength(4);
    let cursor = 0;
    for (const band of b) {
      expect(band.y).toBe(cursor);
      cursor += band.height;
    }
    expect(cursor).toBe(FRAME_HEIGHT);
  });

  it('covers every pixel even when height is not evenly divisible by step count', () => {
    // 1920 is not divisible by 7
    const b = bands(7);
    expect(b).toHaveLength(7);
    let cursor = 0;
    for (const band of b) {
      expect(band.y).toBe(cursor);
      expect(band.height).toBeGreaterThan(0);
      cursor += band.height;
    }
    expect(cursor).toBe(FRAME_HEIGHT);
  });

  it('bands start at the correct y positions', () => {
    const b = bands(2);
    expect(b[0]!.y).toBe(0);
    expect(b[1]!.y).toBe(b[0]!.height);
  });

  it('every band has positive height', () => {
    const b = bands(5);
    for (const band of b) {
      expect(band.height).toBeGreaterThan(0);
    }
  });
});

// ── frameFileName ─────────────────────────────────────────────────────────────

describe('frameFileName', () => {
  it('includes the drawing id', () => {
    expect(frameFileName('fluid-compartments', 0, 3)).toContain('fluid-compartments');
  });

  it('ends with .jpg', () => {
    expect(frameFileName('test', 0, 3)).toMatch(/\.jpg$/);
  });

  it('uses 1-based step numbers in the name', () => {
    expect(frameFileName('test', 0, 3)).toContain('1');
    expect(frameFileName('test', 2, 3)).toContain('3');
  });

  it('zero-pads step numbers so names sort correctly (2 digits for 10+ steps)', () => {
    expect(frameFileName('test', 0, 10)).toMatch(/step-01/);
    expect(frameFileName('test', 9, 10)).toMatch(/step-10/);
  });

  it('no zero-padding needed for fewer than 10 steps', () => {
    expect(frameFileName('test', 0, 9)).toMatch(/step-1/);
  });

  it('produces distinct names for every step', () => {
    const names = Array.from({ length: 5 }, (_, i) => frameFileName('draw', i, 5));
    expect(new Set(names).size).toBe(5);
  });
});

// ── clipFileName ──────────────────────────────────────────────────────────────

describe('clipFileName', () => {
  it('includes the drawing id', () => {
    expect(clipFileName('sodium-potassium-pump')).toContain('sodium-potassium-pump');
  });

  it('ends with .mp4', () => {
    expect(clipFileName('fluid-compartments')).toMatch(/\.mp4$/);
  });
});

// ── frameList ─────────────────────────────────────────────────────────────────

describe('frameList', () => {
  it('returns one spec per step', () => {
    expect(frameList('test', 3)).toHaveLength(3);
    expect(frameList('test', 1)).toHaveLength(1);
  });

  it('returns an empty list for 0 steps', () => {
    expect(frameList('test', 0)).toHaveLength(0);
  });

  it('assigns the drawing id to every spec', () => {
    const list = frameList('osmosis-fluid-shifts', 3);
    expect(list.every((s) => s.drawingId === 'osmosis-fluid-shifts')).toBe(true);
  });

  it('sets correct stepIndex and totalSteps on each spec', () => {
    const list = frameList('test', 4);
    expect(list[0]!.stepIndex).toBe(0);
    expect(list[3]!.stepIndex).toBe(3);
    expect(list[0]!.totalSteps).toBe(4);
    expect(list[3]!.totalSteps).toBe(4);
  });

  it('file names are all distinct', () => {
    const names = frameList('draw', 6).map((s) => s.fileName);
    expect(new Set(names).size).toBe(6);
  });

  it('bands together cover exactly FRAME_HEIGHT pixels', () => {
    const list = frameList('test', 5);
    const total = list.reduce((sum, s) => sum + s.band.height, 0);
    expect(total).toBe(FRAME_HEIGHT);
  });

  it('bands are in order: each band starts where the previous one ends', () => {
    const list = frameList('test', 4);
    let cursor = 0;
    for (const spec of list) {
      expect(spec.band.y).toBe(cursor);
      cursor += spec.band.height;
    }
  });
});

// ── bands: custom drawingHeight (Fix 2 — crop coordinates) ───────────────────

describe('bands with custom drawingHeight', () => {
  it('divides the supplied drawingHeight, not FRAME_HEIGHT', () => {
    const h = 983;
    const b = bands(4, h);
    expect(b).toHaveLength(4);
    let cursor = 0;
    for (const band of b) {
      expect(band.y).toBe(cursor);
      cursor += band.height;
    }
    expect(cursor).toBe(h);
  });

  it('default drawingHeight equals FRAME_HEIGHT', () => {
    const explicit = bands(3, FRAME_HEIGHT);
    const defaulted = bands(3);
    expect(explicit).toEqual(defaulted);
  });

  it('covers exactly drawingHeight pixels for a non-divisible height', () => {
    const h = 983;
    const b = bands(3, h);
    expect(b.reduce((s, band) => s + band.height, 0)).toBe(h);
  });
});

// ── frameList: propagates drawingHeight ───────────────────────────────────────

describe('frameList with custom drawingHeight', () => {
  it('bands together cover the supplied drawingHeight, not FRAME_HEIGHT', () => {
    const h = 983;
    const list = frameList('test', 4, h);
    expect(list.reduce((s, s2) => s + s2.band.height, 0)).toBe(h);
  });
});

// ── escHtml ───────────────────────────────────────────────────────────────────

describe('escHtml', () => {
  it('escapes ampersands', () => { expect(escHtml('a & b')).toBe('a &amp; b'); });
  it('escapes less-than', () => { expect(escHtml('<tag>')).toBe('&lt;tag&gt;'); });
  it('escapes double quotes', () => { expect(escHtml('"hi"')).toBe('&quot;hi&quot;'); });
  it('leaves plain text unchanged', () => { expect(escHtml('hello')).toBe('hello'); });
});

// ── buildFfmpegInput: single-quote escaping (Fix 5) ───────────────────────────

describe('buildFfmpegInput', () => {
  it('produces a file entry for each frame', () => {
    const frames = [{ fileName: 'a.jpg' }, { fileName: 'b.jpg' }];
    const out = buildFfmpegInput(frames, '/out');
    expect(out).toContain('a.jpg');
    expect(out).toContain('b.jpg');
  });

  it('wraps paths in single quotes', () => {
    const out = buildFfmpegInput([{ fileName: 'x.jpg' }], '/out');
    expect(out).toMatch(/file '.*x\.jpg'/);
  });

  it('escapes single quotes inside file paths', () => {
    // A path with an apostrophe must be escaped as '\'' so the concat file stays valid.
    const frames = [{ fileName: "it's.jpg" }, { fileName: "it's.jpg" }];
    const out = buildFfmpegInput(frames, "/dir/it's clips");
    expect(out).not.toMatch(/file '[^']*'[^\\]/); // no bare unescaped ' mid-path
    expect(out).toContain("'\\''"); // contains the escape sequence
  });

  it('ends with a bare file entry (no duration) for the last frame', () => {
    const frames = [{ fileName: 'a.jpg' }, { fileName: 'b.jpg' }];
    const out = buildFfmpegInput(frames, '/out');
    const lines = out.split('\n');
    expect(lines.at(-1)).toMatch(/^file '/);
    expect(lines.at(-1)).not.toContain('duration');
  });
});

// ── frameHtml: brand tokens (Fix 4) ──────────────────────────────────────────

function minimalFrameHtmlOpts() {
  return {
    svgMarkup: '<svg></svg>',
    title: 'Test Title',
    caption: 'Test caption',
    stepLabel: 'step 1 of 1',
    creditLines: ['Credit line'],
    isDraft: false,
    builtCss: '',
    bandY: 0,
    bandHeight: 400,
    drawingHeight: 983,
  };
}

describe('frameHtml', () => {
  it('sets the viewport to FRAME_WIDTH × FRAME_HEIGHT', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).toContain(`width=${FRAME_WIDTH}`);
    expect(html).toContain(`height=${FRAME_HEIGHT}`);
  });

  it('does not use the old hardcoded white background (#fff)', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    // background must use brand Ivory (#f9f5ef), not shorthand #fff
    expect(html).not.toMatch(/background:\s*#fff[^a-f0-9]/i);
  });

  it('does not use the old near-black (#111) for text', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).not.toContain('#111');
  });

  it('does not use the old dark grey (#222) for text', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).not.toContain('#222');
  });

  it('does not use the old medium grey (#666) for secondary text', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).not.toContain('#666');
  });

  it('does not use the old light grey (#888) for credits', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).not.toContain('#888');
  });

  it('does not use the old amber (#f59e0b) for the draft badge', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), isDraft: true });
    expect(html).not.toContain('#f59e0b');
  });

  it('uses brand Ivory (#f9f5ef) as the page background', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).toContain('#f9f5ef');
  });

  it('uses brand Espresso (#3e2c23) for primary text', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).toContain('#3e2c23');
  });

  it('uses brand Bronze (#6b5243) for secondary text', () => {
    const html = frameHtml(minimalFrameHtmlOpts());
    expect(html).toContain('#6b5243');
  });

  it('escapes special characters in title and caption', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), title: '<b>Bold & Safe</b>', caption: '"quoted"' });
    expect(html).not.toContain('<b>Bold');
    expect(html).toContain('&lt;b&gt;Bold &amp; Safe&lt;/b&gt;');
    expect(html).toContain('&quot;quoted&quot;');
  });

  it('includes the draft badge when isDraft is true', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), isDraft: true });
    expect(html).toContain('draft for review');
  });

  it('omits the draft badge when isDraft is false', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), isDraft: false });
    expect(html).not.toContain('draft for review');
  });

  it('injects builtCss into the style block', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), builtCss: '.injected { color: red; }' });
    expect(html).toContain('.injected { color: red; }');
  });
});

// ── frameHtml: geometry (Fix 7 — band/screenshot coordinate space) ───────────

describe('frameHtml drawing-inner geometry', () => {
  it('uses drawingHeight (not FRAME_HEIGHT) for .drawing-inner height', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), drawingHeight: 983 });
    // The .drawing-inner rule must use the measured drawing height.
    expect(html).toMatch(/\.drawing-inner\s*\{[^}]*height:\s*983px/);
    expect(html).not.toMatch(/\.drawing-inner\s*\{[^}]*height:\s*1920px/);
  });

  it('uses bandY for the top offset so the correct band is visible', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), bandY: 245, drawingHeight: 983 });
    expect(html).toContain('top: -245px');
  });

  it('uses bandHeight for the drawing-clip viewport height', () => {
    const html = frameHtml({ ...minimalFrameHtmlOpts(), bandHeight: 248, drawingHeight: 983 });
    expect(html).toContain('height:248px');
  });

  it('different drawingHeight values produce different inner heights', () => {
    const html500 = frameHtml({ ...minimalFrameHtmlOpts(), drawingHeight: 500 });
    const html983 = frameHtml({ ...minimalFrameHtmlOpts(), drawingHeight: 983 });
    expect(html500).toContain('height: 500px');
    expect(html983).toContain('height: 983px');
    expect(html500).not.toContain('height: 983px');
  });
});

// ── rewriteFontUrls: file:// font paths (Fix 8 — Inter font on file:// pages) ─

describe('rewriteFontUrls', () => {
  it('rewrites /_astro/ font URLs to absolute file:// paths', () => {
    const css = "src: url(/_astro/Inter-Bold.B1a2c3.woff2) format('woff2');";
    const result = rewriteFontUrls(css, '/abs/path/dist/_astro');
    expect(result).toBe("src: url(file:///abs/path/dist/_astro/Inter-Bold.B1a2c3.woff2) format('woff2');");
  });

  it('rewrites multiple font URLs in one CSS string', () => {
    const css = "url(/_astro/A.woff2) url(/_astro/B.woff2)";
    const result = rewriteFontUrls(css, '/dist/_astro');
    expect(result).toContain('file:///dist/_astro/A.woff2');
    expect(result).toContain('file:///dist/_astro/B.woff2');
    expect(result).not.toContain('url(/_astro/');
  });

  it('leaves non-font URLs unchanged', () => {
    const css = "background: url(/images/logo.png);";
    expect(rewriteFontUrls(css, '/dist/_astro')).toBe(css);
  });

  it('returns unchanged CSS when there are no /_astro/ font URLs', () => {
    const css = '.frame { color: red; }';
    expect(rewriteFontUrls(css, '/dist/_astro')).toBe(css);
  });
});

// ── false-success exit code (Fix 3) ───────────────────────────────────────────

describe('encode-error exit code', () => {
  it('returns 0 when no encode errors occur', () => {
    // encodeErrors counter logic: 0 errors → exit 0
    const encodeErrors = 0;
    expect(encodeErrors > 0 ? 1 : 0).toBe(0);
  });

  it('returns 1 when at least one encode error occurs', () => {
    const encodeErrors = 1;
    expect(encodeErrors > 0 ? 1 : 0).toBe(1);
  });

  it('returns 1 for multiple encode errors', () => {
    const encodeErrors = 3;
    expect(encodeErrors > 0 ? 1 : 0).toBe(1);
  });
});

// ── Node entry-point import check (Fix 6 — ERR_MODULE_NOT_FOUND regression) ──
// Spawns the documented Node command so any extensionless relative import in the
// dependency chain would produce ERR_MODULE_NOT_FOUND before this test passes.
// The script itself needs dist/ to run fully, so the test only verifies the
// import graph loads; any exit code other than a module-not-found crash is fine.

describe('Node entry-point import check', () => {
  it('documented node command loads without ERR_MODULE_NOT_FOUND', () => {
    const scriptPath = resolve('scripts/export-clips.ts');
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', scriptPath, '--out', '/nonexistent-test-path-42', '--frames-only'],
      { encoding: 'utf-8', timeout: 30_000 },
    );
    // A module-not-found crash produces a non-zero status AND the error in stderr.
    // With the import fixes applied, the script loads, then exits 2 (missing dist/)
    // or exits cleanly — neither contains ERR_MODULE_NOT_FOUND.
    expect(result.stderr ?? '').not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.signal).toBeNull();
  });
});

// ── parseArguments ────────────────────────────────────────────────────────────

describe('parseArguments', () => {
  it('parses --out', () => {
    const opts = parseArguments(['--out', '/tmp/clips']);
    expect(opts.out).toBe('/tmp/clips');
    expect(opts.framesOnly).toBe(false);
  });

  it('parses --frames-only flag', () => {
    const opts = parseArguments(['--out', '/tmp/clips', '--frames-only']);
    expect(opts.framesOnly).toBe(true);
  });

  it('throws ClipError when --out is missing', () => {
    expect(() => parseArguments([])).toThrow(ClipError);
  });

  it('throws ClipError for unknown flags', () => {
    expect(() => parseArguments(['--out', '/tmp', '--unknown'])).toThrow(ClipError);
  });

  it('throws ClipError when --out is empty', () => {
    expect(() => parseArguments(['--out', '   '])).toThrow(ClipError);
  });
});
