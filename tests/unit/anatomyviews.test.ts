import { describe, expect, it } from 'vitest';
import {
  KEY_MAP,
  VIEW_PRESETS,
  canvasKeyAction,
  coverDownloadNote,
  focusFromSearch,
  formatDownloadSize,
  initialSystemKey,
  isViewPreset,
  presetDirection,
} from '../../src/islands/anatomyviews';

describe('anatomy lab preset views', () => {
  it('offers front, back, both sides and top, each with its own number key', () => {
    expect(VIEW_PRESETS.map((p) => p.id)).toEqual(['front', 'back', 'left', 'right', 'top']);
    expect(new Set(VIEW_PRESETS.map((p) => p.key)).size).toBe(VIEW_PRESETS.length);
    expect(new Set(VIEW_PRESETS.map((p) => p.label)).size).toBe(VIEW_PRESETS.length);
  });

  it('gives every preset a unit direction, with opposite views opposite', () => {
    for (const preset of VIEW_PRESETS) {
      expect(Math.hypot(...presetDirection(preset.id))).toBeCloseTo(1, 9);
    }
    expect(presetDirection('front')).toEqual([0, 0, 1]);
    expect(presetDirection('back')).toEqual([0, 0, -1]);
    expect(presetDirection('left')).toEqual([1, 0, 0]);
    expect(presetDirection('right')).toEqual([-1, 0, 0]);
  });

  it('never puts the top view exactly on the up axis', () => {
    const [x, y, z] = presetDirection('top');
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(0.999);
    expect(z).toBeGreaterThan(0);
  });

  it('recognises only its own preset ids', () => {
    expect(isViewPreset('top')).toBe(true);
    expect(isViewPreset('bottom')).toBe(false);
    expect(isViewPreset(null)).toBe(false);
  });
});

describe('anatomy lab keyboard map', () => {
  const STEP = 0.25;
  const ZOOM = 0.8;

  it('turns and tilts with the arrow keys', () => {
    expect(canvasKeyAction('ArrowLeft', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: -STEP, pitch: 0 });
    expect(canvasKeyAction('ArrowRight', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: STEP, pitch: 0 });
    expect(canvasKeyAction('ArrowUp', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: 0, pitch: -STEP });
    expect(canvasKeyAction('ArrowDown', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: 0, pitch: STEP });
  });

  it('zooms with plus and minus, shifted or not', () => {
    for (const key of ['+', '=']) expect(canvasKeyAction(key, STEP, ZOOM)).toEqual({ kind: 'zoom', factor: ZOOM });
    for (const key of ['-', '_']) expect(canvasKeyAction(key, STEP, ZOOM)).toEqual({ kind: 'zoom', factor: 1 / ZOOM });
  });

  it('resets with 0 or Home and jumps to a preset with 1 to 5', () => {
    expect(canvasKeyAction('0', STEP, ZOOM)).toEqual({ kind: 'reset' });
    expect(canvasKeyAction('Home', STEP, ZOOM)).toEqual({ kind: 'reset' });
    for (const preset of VIEW_PRESETS) {
      expect(canvasKeyAction(preset.key, STEP, ZOOM)).toEqual({ kind: 'view', preset: preset.id });
    }
  });

  it('leaves every other key to the browser, Tab and Escape included', () => {
    for (const key of ['Tab', 'Escape', 'Enter', ' ', 'a', '6', '9', 'PageDown', 'End']) {
      expect(canvasKeyAction(key, STEP, ZOOM)).toBeNull();
    }
  });

  it('lists every preset key in the keys panel', () => {
    const listed = KEY_MAP.map((row) => row.keys);
    for (const preset of VIEW_PRESETS) expect(listed).toContain(preset.key);
    expect(KEY_MAP.every((row) => row.does.length > 0)).toBe(true);
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe('anatomy lab download-size notes', () => {
  it('rounds up so a note never promises less than the download', () => {
    expect(formatDownloadSize(1)).toBe('1 KB');
    expect(formatDownloadSize(44_001)).toBe('45 KB');
    expect(formatDownloadSize(999_999)).toBe('1000 KB');
    expect(formatDownloadSize(1_000_000)).toBe('1.0 MB');
    expect(formatDownloadSize(2_310_000)).toBe('2.4 MB');
  });

  it('says nothing for a size it cannot trust', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatDownloadSize(bad)).toBeNull();
  });

  it('names the first system and its size on the cover only when both are known', () => {
    expect(coverDownloadNote('[sample system]', 2_310_000)).toBe(
      'loads the 3D viewer, then one body system at a time. the first, [sample system], is a 2.4 MB download.',
    );
    const plain = 'loads the 3D viewer, then one body system at a time.';
    expect(coverDownloadNote(null, 2_310_000)).toBe(plain);
    expect(coverDownloadNote('[sample system]', undefined)).toBe(plain);
    expect(coverDownloadNote('[sample system]', 0)).toBe(plain);
  });
});

describe('anatomy lab lesson links', () => {
  it('reads a system and a structure from the address', () => {
    expect(focusFromSearch('?system=sample-system&structure=FIX003')).toEqual({ system: 'sample-system', structure: 'FIX003' });
    expect(focusFromSearch('?fixture&structure=FIX001')).toEqual({ system: null, structure: 'FIX001' });
    expect(focusFromSearch('')).toEqual({ system: null, structure: null });
  });

  it('ignores anything that is not a well-formed key or id', () => {
    for (const bad of ['../etc', 'Sample', 'a b', '<script>', 'a--b', '-a', 'a-', 'x'.repeat(65)]) {
      expect(focusFromSearch(`?system=${encodeURIComponent(bad)}`).system).toBeNull();
    }
    for (const bad of ['', ' ', 'a b', '<img>', '-FIX', 'javascript:1', 'x'.repeat(65)]) {
      expect(focusFromSearch(`?structure=${encodeURIComponent(bad)}`).structure).toBeNull();
    }
  });

  it('starts on the linked system only when this build has it', () => {
    const keys = ['one', 'two'];
    expect(initialSystemKey(keys, { system: 'two', structure: null })).toBe('two');
    expect(initialSystemKey(keys, { system: 'three', structure: null })).toBe('one');
    expect(initialSystemKey(keys, { system: null, structure: null })).toBe('one');
    expect(initialSystemKey([], { system: 'two', structure: null })).toBe('');
  });
});
