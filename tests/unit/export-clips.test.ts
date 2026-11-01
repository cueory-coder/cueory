import { describe, expect, it } from 'vitest';
import {
  bands,
  clipFileName,
  frameFileName,
  frameList,
  parseArguments,
  ClipError,
  FRAME_HEIGHT,
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
