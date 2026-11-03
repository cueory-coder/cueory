import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BODYPARTS3D_CREDIT,
  EXPORT_SIZES,
  FIXTURE_CREDIT,
  answerQuiz,
  creditFor,
  draftsAllowed,
  exportFileName,
  exportRegion,
  fitDistance,
  groupStructures,
  labDataForBuild,
  labelsToShow,
  layoutLabels,
  matchesSearch,
  nameSourceFor,
  nextQuiz,
  onlyThis,
  parseAnatomyFile,
  pictureCreditFor,
  releaseNoteFor,
  pickQuizTarget,
  revealQuiz,
  slugify,
  startQuiz,
  systemKeyFromPath,
  toggleHidden,
  wrapText,
  type LabelAnchor,
  type PlacedLabel,
} from '../../src/islands/anatomylab';
import { fixtureGlb, fixtureShapes } from '../fixtures/anatomyfixture';

const fixtureJson = JSON.parse(readFileSync(new URL('../fixtures/anatomy-fixture.json', import.meta.url), 'utf8'));

/** A system file in the Task 177 shape, with made-up ids and obviously fake names (no anatomy here). */
function file(overrides: Record<string, unknown> = {}) {
  return {
    id: 'anatomy-sample',
    title: 'sample system',
    kind: 'model',
    lessonIds: ['U01-T01-L01'],
    status: 'draft',
    model: { file: '/models/anatomy/sample.glb', release: 'r1' },
    labels: [
      { id: 'FMA1', text: 'sample part one', source: 'bp3d-FMA1', group: 'set x' },
      { id: 'FMA2', text: 'sample part two', source: 'bp3d-FMA2' },
    ],
    depictions: [],
    sources: [],
    ...overrides,
  };
}

/** A seeded random number source, so quiz tests are repeatable. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('anatomy files', () => {
  it('names a system by its file', () => {
    expect(systemKeyFromPath('../../../content/visuals/anatomy-heart.json')).toBe('heart');
    expect(systemKeyFromPath('content/visuals/anatomy-skeleton-axial.json')).toBe('skeleton-axial');
    expect(systemKeyFromPath('content/visuals/fluid-compartments.json')).toBeNull();
    expect(systemKeyFromPath('content/visuals/anatomy-.json')).toBeNull();
  });

  it('reads the contract shape and keeps official names exactly as written', () => {
    const system = parseAnatomyFile(file({ model: { file: '/models/anatomy/sample.glb', release: 'r1', via: 'gltfpack' } }), 'content/visuals/anatomy-sample.json');
    expect(system).toEqual({
      key: 'sample',
      title: 'sample system',
      status: 'draft',
      model: { file: '/models/anatomy/sample.glb', release: 'r1', via: 'gltfpack' },
      structures: [
        { id: 'FMA1', text: 'sample part one', group: 'set x' },
        { id: 'FMA2', text: 'sample part two' },
      ],
    });
    // The island never gets the sources: only what it shows.
    expect(JSON.stringify(system)).not.toContain('bp3d-');
  });

  it.each([
    ['a model file on another site', { model: { file: 'https://example.com/a.glb', release: 'r1' } }, 'model.file'],
    ['a model path that climbs out', { model: { file: '/models/../secret.glb', release: 'r1' } }, 'model.file'],
    ['a model that is not a .glb', { model: { file: '/models/anatomy/a.gltf', release: 'r1' } }, 'model.file'],
    ['no release', { model: { file: '/models/anatomy/a.glb' } }, 'model.release'],
    ['an unknown status', { status: 'published' }, 'status'],
    ['no labels', { labels: [] }, 'labels'],
    ['a duplicate id', { labels: [{ id: 'FMA1', text: 'a', source: 's' }, { id: 'FMA1', text: 'b', source: 's' }] }, 'two labels'],
    ['an id with a space', { labels: [{ id: 'FMA 1', text: 'a', source: 's' }] }, 'id'],
    ['a label without a name', { labels: [{ id: 'FMA1', text: ' ', source: 's' }] }, 'official name'],
    ['a label without a source', { labels: [{ id: 'FMA1', text: 'a' }] }, 'source'],
  ])('stops the build on %s', (_, overrides, message) => {
    expect(() => parseAnatomyFile(file(overrides), 'content/visuals/anatomy-sample.json')).toThrow(message);
  });

  it('reads the test fixture as a fixture', () => {
    const fixture = parseAnatomyFile(fixtureJson, 'tests/fixtures/anatomy-fixture.json', { fixture: true });
    expect(fixture.fixture).toBe(true);
    expect(fixture.structures.every((s) => s.text.startsWith('fixture '))).toBe(true);
    expect(creditFor(fixture)).toBe(FIXTURE_CREDIT);
    expect(nameSourceFor(fixture)).toBe('name from the test fixture');
  });

  it('credits BodyParts3D word for word on every real system', () => {
    const system = parseAnatomyFile(file(), 'content/visuals/anatomy-sample.json');
    expect(creditFor(system)).toBe(
      '3D model: Cueory, adapted from BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
    );
    expect(BODYPARTS3D_CREDIT).toContain('BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International');
    expect(nameSourceFor(system)).toBe('name from the BodyParts3D parts list');
  });
});

describe('the release note', () => {
  it('says a draft model is a draft, built from its release, under the view and on every picture', () => {
    const draft = parseAnatomyFile(file({ model: { file: '/models/anatomy/sample.glb', release: 'BodyParts3D 3.0 (2011-09-15)' } }), 'content/visuals/anatomy-sample.json');
    expect(releaseNoteFor(draft)).toBe('draft model, built from BodyParts3D 3.0 (2011-09-15)');
    expect(pictureCreditFor(draft)).toBe(`${BODYPARTS3D_CREDIT} · draft model, built from BodyParts3D 3.0 (2011-09-15)`);
    const approved = { ...draft, status: 'approved' as const };
    expect(releaseNoteFor(approved)).toBe('model release: BodyParts3D 3.0 (2011-09-15)');
    const fixture = parseAnatomyFile(fixtureJson, 'tests/fixtures/anatomy-fixture.json', { fixture: true });
    expect(releaseNoteFor(fixture)).toBe('model release: fixture 1 (made in code)');
  });
});

describe('the draft gate (D-56)', () => {
  it('hides drafts on the live site\'s build', () => {
    expect(draftsAllowed({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(false);
  });

  it('hides drafts on a Workers build that does not name its branch', () => {
    expect(draftsAllowed({ WORKERS_CI: '1' })).toBe(false);
    expect(draftsAllowed({ WORKERS_CI: '1', WORKERS_CI_BRANCH: '  ' })).toBe(false);
  });

  it('shows drafts on staging, branch previews and builds outside Workers Builds', () => {
    expect(draftsAllowed({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(true);
    expect(draftsAllowed({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/anatomy-lab' })).toBe(true);
    expect(draftsAllowed({})).toBe(true);
  });

  it('puts no draft and no fixture in the live site\'s page data', () => {
    const files = {
      '../../../content/visuals/anatomy-heart.json': file({ title: 'sample heart' }),
      '../../../content/visuals/anatomy-lungs.json': file({ title: 'sample lungs', status: 'approved' }),
    };
    const live = labDataForBuild(files, fixtureJson, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' });
    expect(live.drafts).toBe(false);
    expect(live.fixture).toBeNull();
    expect(live.systems.map((s) => s.key)).toEqual(['lungs']);
    expect(JSON.stringify(live)).not.toContain('sample heart');

    const none = labDataForBuild({ '../../../content/visuals/anatomy-heart.json': file() }, fixtureJson, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' });
    expect(none.systems).toEqual([]);

    const staging = labDataForBuild(files, fixtureJson, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' });
    expect(staging.drafts).toBe(true);
    expect(staging.systems.map((s) => s.title)).toEqual(['sample heart', 'sample lungs']);
    expect(staging.fixture?.fixture).toBe(true);
  });

  it('builds the system list from whichever anatomy files exist, ignoring other visuals', () => {
    const data = labDataForBuild(
      {
        '../../../content/visuals/anatomy-skeleton-limbs.json': file({ title: 'b limbs' }),
        '../../../content/visuals/anatomy-skeleton-axial.json': file({ title: 'a axial' }),
      },
      fixtureJson,
      {},
    );
    expect(data.systems.map((s) => s.key)).toEqual(['skeleton-axial', 'skeleton-limbs']);
  });
});

describe('the structure list', () => {
  const structures = [
    { id: 'A', text: 'Left  part', group: 'one' },
    { id: 'B', text: 'right part', group: 'two' },
    { id: 'C', text: 'middle piece' },
    { id: 'D', text: 'café corner', group: 'one' },
  ];

  it('groups by group in first-seen order, keeping file order inside a group', () => {
    expect(groupStructures(structures).map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ['one', ['A', 'D']],
      ['two', ['B']],
      [null, ['C']],
    ]);
  });

  it('searches without caring about case, spacing, punctuation or accents', () => {
    expect(matchesSearch('Left  part', 'left part')).toBe(true);
    expect(matchesSearch('café corner', 'CAFE')).toBe(true);
    expect(matchesSearch('right part', 'part right')).toBe(true);
    expect(matchesSearch('right part', 'left')).toBe(false);
    // A query word must start a word of the name: "b" finds "cube B", not "cube A" (whose "cube" has a b in it).
    expect(matchesSearch('fixture cube B', 'cube b')).toBe(true);
    expect(matchesSearch('fixture cube A', 'cube b')).toBe(false);
    expect(matchesSearch('right part', 'art')).toBe(false);
    expect(groupStructures(structures, 'part').map((g) => g.items.map((i) => i.id))).toEqual([['A'], ['B']]);
    expect(groupStructures(structures, 'nothing like this')).toEqual([]);
  });

  it('hides, shows and shows only one', () => {
    expect([...toggleHidden(new Set(['A']), 'A')]).toEqual([]);
    expect([...toggleHidden(new Set(), 'A')]).toEqual(['A']);
    expect([...onlyThis(['A', 'B', 'C'], 'B')]).toEqual(['A', 'C']);
  });

  it('labels every visible structure, or only the selected one when there are many', () => {
    expect(labelsToShow(['A', 'B'], null, 3)).toEqual(['A', 'B']);
    expect(labelsToShow(['A', 'B', 'C', 'D'], 'C', 3)).toEqual(['C']);
    expect(labelsToShow(['A', 'B', 'C', 'D'], null, 3)).toEqual([]);
    expect(labelsToShow(['A', 'B', 'C', 'D'], 'Z', 3)).toEqual([]);
  });
});

describe('the "find it" quiz', () => {
  const pool = ['A', 'B', 'C', 'D'];

  it('asks every structure once per round, never repeating', () => {
    const random = seeded(7);
    let state = startQuiz(pool, random);
    const asked = [state.target];
    for (let i = 0; i < pool.length - 1; i++) {
      state = nextQuiz(answerQuiz(state, state.target!), pool, random);
      asked.push(state.target);
    }
    expect(new Set(asked).size).toBe(pool.length);
    expect(asked.sort()).toEqual([...pool].sort());
    state = nextQuiz(answerQuiz(state, state.target!), pool, random);
    expect(state.target).toBeNull();
    expect(state).toMatchObject({ right: 4, answered: 4 });
  });

  it('never picks outside the pool or one already asked, whatever the random number', () => {
    expect(pickQuizTarget(pool, ['A', 'B', 'C'], () => 0.999999)).toBe('D');
    expect(pickQuizTarget(pool, [], () => 0)).toBe('A');
    expect(pickQuizTarget(pool, [], () => 1)).toBe('D');
    expect(pickQuizTarget(pool, pool, () => 0.5)).toBeNull();
    expect(pickQuizTarget([], [], () => 0.5)).toBeNull();
  });

  it('counts only the first pick of a question', () => {
    let state = startQuiz(pool, () => 0); // target A
    state = answerQuiz(state, 'B');
    expect(state.feedback).toEqual({ kind: 'wrong', picked: 'B' });
    expect(state).toMatchObject({ right: 0, answered: 1 });
    state = answerQuiz(state, 'A');
    expect(state.feedback).toEqual({ kind: 'right', picked: 'A' });
    expect(state).toMatchObject({ right: 0, answered: 1 });
    // Once found, more picks change nothing.
    expect(answerQuiz(state, 'C')).toBe(state);
  });

  it('"show me" reveals and counts an unanswered question as answered, not right', () => {
    let state = startQuiz(pool, () => 0);
    state = revealQuiz(state);
    expect(state.feedback).toEqual({ kind: 'shown' });
    expect(state).toMatchObject({ right: 0, answered: 1 });
    expect(answerQuiz(state, 'A')).toBe(state);
    state = nextQuiz(state, pool, () => 0);
    expect(state.target).toBe('B');
    expect(state.feedback).toBeNull();
  });

  it('"next" before answering counts the skipped question once', () => {
    let state = startQuiz(pool, () => 0);
    state = nextQuiz(state, pool, () => 0);
    expect(state).toMatchObject({ answered: 1, right: 0, target: 'B' });
  });
});

describe('labels with leader lines', () => {
  const overlap = (a: PlacedLabel, b: PlacedLabel) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('puts a label beside its anchor, on the side away from the middle, with the line at its near edge', () => {
    const [right] = layoutLabels([{ id: 'r', x: 300, y: 100, width: 80, height: 30 }], { width: 500, height: 300, offset: 20 });
    expect(right).toMatchObject({ x: 320, y: 85, lineX: 320, lineY: 100, anchorX: 300, anchorY: 100 });
    const [left] = layoutLabels([{ id: 'l', x: 120, y: 100, width: 80, height: 30 }], { width: 500, height: 300, offset: 20 });
    expect(left).toMatchObject({ x: 120 - 20 - 80, lineX: 120 - 20 });
  });

  it('puts labels outside the model\'s columns when there is room', () => {
    const placed = layoutLabels(
      [
        { id: 'r', x: 260, y: 100, width: 60, height: 24 },
        { id: 'l', x: 220, y: 100, width: 60, height: 24 },
      ],
      { width: 480, height: 300, offset: 10, columns: { left: 180, right: 300 } },
    );
    const byId = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(byId['r']!.x).toBe(310);
    expect(byId['l']!.x + byId['l']!.width).toBe(170);
  });

  it('never lets two labels overlap, even when every anchor is in the same place', () => {
    const anchors: LabelAnchor[] = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, x: 200, y: 150, width: 90, height: 28 }));
    const placed = layoutLabels(anchors, { width: 400, height: 300 });
    expect(placed.length).toBeGreaterThanOrEqual(6);
    for (const a of placed) for (const b of placed) if (a !== b) expect(overlap(a, b)).toBe(false);
  });

  it('keeps every label inside the view and leaves out the ones with no room', () => {
    const anchors: LabelAnchor[] = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, x: (i * 37) % 300, y: (i * 53) % 200, width: 70, height: 26 }));
    const placed = layoutLabels(anchors, { width: 300, height: 200, margin: 8 });
    expect(placed.length).toBeLessThan(40);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(8);
      expect(p.y).toBeGreaterThanOrEqual(8);
      expect(p.x + p.width).toBeLessThanOrEqual(292);
      expect(p.y + p.height).toBeLessThanOrEqual(192);
    }
    for (const a of placed) for (const b of placed) if (a !== b) expect(overlap(a, b)).toBe(false);
  });

  it('gives the same layout whatever order the anchors come in', () => {
    const anchors: LabelAnchor[] = [
      { id: 'a', x: 50, y: 40, width: 60, height: 24 },
      { id: 'b', x: 52, y: 44, width: 60, height: 24 },
      { id: 'c', x: 250, y: 90, width: 60, height: 24 },
    ];
    const sort = (list: PlacedLabel[]) => [...list].sort((x, y) => x.id.localeCompare(y.id));
    expect(sort(layoutLabels([...anchors].reverse(), { width: 320, height: 200 }))).toEqual(sort(layoutLabels(anchors, { width: 320, height: 200 })));
  });

  it('skips a label wider than the view and an anchor that did not project', () => {
    expect(layoutLabels([{ id: 'wide', x: 10, y: 10, width: 500, height: 20 }], { width: 320, height: 200 })).toEqual([]);
    expect(layoutLabels([{ id: 'nan', x: Number.NaN, y: 10, width: 50, height: 20 }], { width: 320, height: 200 })).toEqual([]);
  });
});

describe('exported pictures', () => {
  it('offers the three sizes', () => {
    expect(EXPORT_SIZES).toEqual({
      phone: { width: 1080, height: 1920, label: 'phone 1080×1920' },
      wide: { width: 1920, height: 1080, label: 'wide 1920×1080' },
      square: { width: 1080, height: 1080, label: 'square 1080×1080' },
    });
  });

  it('names the file cueory-<system>[-<structure>]-<size>.png', () => {
    expect(exportFileName('heart', null, 'phone')).toBe('cueory-heart-phone.png');
    expect(exportFileName('kidneys', 'right kidney', 'wide')).toBe('cueory-kidneys-right-kidney-wide.png');
    expect(exportFileName('skeleton-axial', 'Body of Vertebra (L1)', 'square')).toBe('cueory-skeleton-axial-body-of-vertebra-l1-square.png');
    expect(exportFileName('fixture', '!!!', 'square')).toBe('cueory-fixture-square.png');
  });

  it('makes safe, short slugs', () => {
    expect(slugify('  Café / Ünïcode  name  ')).toBe('cafe-unicode-name');
    expect(slugify('a'.repeat(100))).toHaveLength(60);
    expect(slugify(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59));
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
  });

  it('crops the picture to the visible model, keeping its shape and leaving room for labels', () => {
    const view = { width: 1600, height: 900 };
    const extent = { x: 700, y: 300, width: 200, height: 300 };
    const phone = exportRegion(extent, view, 9 / 16, false);
    expect(phone.width / phone.height).toBeCloseTo(9 / 16, 6);
    // centred on the model, and holds all of it
    expect(phone.x + phone.width / 2).toBeCloseTo(800, 6);
    expect(phone.y + phone.height / 2).toBeCloseTo(450, 6);
    expect(phone.x).toBeLessThanOrEqual(700);
    expect(phone.y).toBeLessThanOrEqual(300);
    expect(phone.x + phone.width).toBeGreaterThanOrEqual(900);
    expect(phone.y + phone.height).toBeGreaterThanOrEqual(600);
    const withLabels = exportRegion(extent, view, 9 / 16, true);
    expect(withLabels.width).toBeGreaterThan(phone.width);
  });

  it('uses only the part of the model that is on screen, or the whole view when none is', () => {
    const view = { width: 1000, height: 1000 };
    const clipped = exportRegion({ x: -5000, y: -5000, width: 20000, height: 20000 }, view, 1, false);
    expect(clipped.width).toBeCloseTo(1000 * 1.2, 6);
    expect(clipped.x + clipped.width / 2).toBeCloseTo(500, 6);
    const offScreen = exportRegion({ x: 2000, y: 2000, width: 10, height: 10 }, view, 1, false);
    expect(offScreen.x + offScreen.width / 2).toBeCloseTo(500, 6);
    expect(exportRegion(null, view, 1, false).width).toBeCloseTo(1200, 6);
  });

  it('wraps the credit into lines that fit', () => {
    const measure = (s: string) => s.length * 10;
    const lines = wrapText(BODYPARTS3D_CREDIT, 400, measure);
    expect(lines.join(' ')).toBe(BODYPARTS3D_CREDIT);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(400);
    expect(wrapText('averyveryverylongword short', 50, measure)).toEqual(['averyveryverylongword', 'short']);
  });

  it('frames a box seen from the front, the tighter way round deciding', () => {
    const tan = Math.tan((17.5 * Math.PI) / 180);
    const tall = fitDistance({ x: 1, y: 10, z: 2 }, 35, 1);
    expect(tall).toBeCloseTo((5 / tan) * 1.12 + 1, 6);
    const wide = fitDistance({ x: 10, y: 1, z: 0 }, 35, 0.5);
    expect(wide).toBeCloseTo((5 / (tan * 0.5)) * 1.12, 6);
    expect(fitDistance({ x: 0, y: 0, z: 0 }, 35, 1)).toBeGreaterThan(0);
  });
});

describe('the test fixture model', () => {
  it('is a valid .glb whose mesh nodes are exactly the fixture JSON ids', () => {
    const glb = fixtureGlb();
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a);
    const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
    const binLength = view.getUint32(20 + jsonLength, true);
    expect(view.getUint32(24 + jsonLength, true)).toBe(0x004e4942);
    expect(gltf.buffers[0].byteLength).toBe(binLength);
    expect(28 + jsonLength + binLength).toBe(glb.byteLength);
    expect(gltf.nodes.map((n: { name: string }) => n.name)).toEqual(fixtureJson.labels.map((l: { id: string }) => l.id));
    expect(glb.byteLength).toBeLessThan(10_000);
  });

  it('is the same bytes every build', () => {
    expect(Buffer.from(fixtureGlb()).equals(Buffer.from(fixtureGlb()))).toBe(true);
    expect(fixtureShapes()).toHaveLength(5);
  });

  it('names only obvious test shapes, never anatomy', () => {
    for (const label of fixtureJson.labels) expect(label.text).toMatch(/^fixture (cube|block|point|slab) [A-E]$/);
  });
});
