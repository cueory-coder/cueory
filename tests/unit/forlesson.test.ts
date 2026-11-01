import { describe, expect, it } from 'vitest';
import { visualsForLesson, missingDrawings } from '../../src/visuals/forlesson';
import type { Visual } from '../../src/visuals/sources';

// ── helpers ──────────────────────────────────────────────────────────────────

function make(overrides: Partial<Visual> & Pick<Visual, 'id' | 'status'>): Visual {
  return {
    title: overrides.id,
    kind: 'diagram',
    lessonIds: [],
    labels: [],
    depictions: [],
    sources: [],
    ...overrides,
  };
}

// 'fluid-compartments', 'osmosis-fluid-shifts', 'sodium-potassium-pump' are in
// the drawings registry. Use those ids for "has drawing" cases.
const HAS_DRAWING = 'fluid-compartments';
const ALSO_HAS = 'osmosis-fluid-shifts';
const NO_DRAWING = 'not-in-registry';

const LESSON = 'U01-T01-L01';
const OTHER_LESSON = 'U01-T01-L02';

// ── visualsForLesson ──────────────────────────────────────────────────────────

describe('visualsForLesson', () => {
  it('returns an approved visual that lists the lesson and has a drawing', () => {
    const v = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [LESSON] });
    expect(visualsForLesson([v], LESSON)).toEqual([v]);
  });

  it('excludes a draft even when it lists the lesson and has a drawing', () => {
    const v = make({ id: HAS_DRAWING, status: 'draft', lessonIds: [LESSON] });
    expect(visualsForLesson([v], LESSON)).toEqual([]);
  });

  it('excludes an approved visual that does not list the lesson', () => {
    const v = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [OTHER_LESSON] });
    expect(visualsForLesson([v], LESSON)).toEqual([]);
  });

  it('excludes an approved visual that lists the lesson but has no drawing', () => {
    const v = make({ id: NO_DRAWING, status: 'approved', lessonIds: [LESSON] });
    expect(visualsForLesson([v], LESSON)).toEqual([]);
  });

  it('returns nothing for an unknown lesson', () => {
    const v = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [LESSON] });
    expect(visualsForLesson([v], 'UNKNOWN-LESSON')).toEqual([]);
  });

  it('returns nothing for an empty visuals array', () => {
    expect(visualsForLesson([], LESSON)).toEqual([]);
  });

  it('preserves source-array order across multiple qualifying visuals', () => {
    const a = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [LESSON] });
    const b = make({ id: ALSO_HAS, status: 'approved', lessonIds: [LESSON] });
    expect(visualsForLesson([a, b], LESSON).map((v) => v.id)).toEqual([HAS_DRAWING, ALSO_HAS]);
    expect(visualsForLesson([b, a], LESSON).map((v) => v.id)).toEqual([ALSO_HAS, HAS_DRAWING]);
  });

  it('includes a visual listed in multiple lessons when the target lesson is among them', () => {
    const v = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [OTHER_LESSON, LESSON] });
    expect(visualsForLesson([v], LESSON)).toEqual([v]);
  });

  it('does not mutate the input array', () => {
    const v = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [LESSON] });
    const input: Visual[] = [v];
    visualsForLesson(input, LESSON);
    expect(input).toHaveLength(1);
  });
});

// ── missingDrawings ───────────────────────────────────────────────────────────

describe('missingDrawings', () => {
  it('returns an approved visual whose id is not in the drawings registry', () => {
    const v = make({ id: NO_DRAWING, status: 'approved', lessonIds: [LESSON] });
    expect(missingDrawings([v])).toEqual([v]);
  });

  it('does not return an approved visual that has a drawing', () => {
    const v = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [LESSON] });
    expect(missingDrawings([v])).toEqual([]);
  });

  it('does not return a draft even when its drawing is absent', () => {
    const v = make({ id: NO_DRAWING, status: 'draft', lessonIds: [LESSON] });
    expect(missingDrawings([v])).toEqual([]);
  });

  it('returns nothing for an empty visuals array', () => {
    expect(missingDrawings([])).toEqual([]);
  });

  it('returns only the visuals missing a drawing out of a mixed list', () => {
    const withDrawing = make({ id: HAS_DRAWING, status: 'approved', lessonIds: [LESSON] });
    const without = make({ id: NO_DRAWING, status: 'approved', lessonIds: [LESSON] });
    const draft = make({ id: 'another-missing', status: 'draft', lessonIds: [LESSON] });
    expect(missingDrawings([withDrawing, without, draft])).toEqual([without]);
  });
});

// ── real batch-1 files (all drafts today) ────────────────────────────────────

describe('real batch-1 content files', () => {
  // Dynamically import the real JSON files so this test reflects the actual repo state.
  it('batch-1 visuals are all drafts so a lesson shows none of them', async () => {
    const [fc, ofs, skp] = await Promise.all([
      import('../../content/visuals/fluid-compartments.json'),
      import('../../content/visuals/osmosis-fluid-shifts.json'),
      import('../../content/visuals/sodium-potassium-pump.json'),
    ]);
    // Cast to Visual — the JSON shape matches; the content loader validates them at build time.
    const batch1 = [fc.default, ofs.default, skp.default] as unknown as Visual[];
    expect(batch1.every((v) => v.status === 'draft')).toBe(true);

    // Because they are all drafts, no lesson returns any of them.
    const allLessons = batch1.flatMap((v) => v.lessonIds);
    for (const lessonId of allLessons) {
      expect(visualsForLesson(batch1, lessonId)).toEqual([]);
    }
  });
});
