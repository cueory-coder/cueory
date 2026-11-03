import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEHIND_MARK,
  BODYPARTS3D_CREDIT,
  EXPORT_PAD,
  EXPORT_SIZES,
  FIT_MARGIN,
  FIXTURE_CREDIT,
  answerQuiz,
  creditFor,
  draftsAllowed,
  encodeId,
  exportFileName,
  exportRegion,
  findVisibleAnchors,
  fitDistance,
  groupStructures,
  labDataForBuild,
  labelLines,
  labelRoomFor,
  labelsToShow,
  layoutLabels,
  leftOutNote,
  matchesSearch,
  nameSourceFor,
  nextQuiz,
  onlyThis,
  parseAnatomyFile,
  pictureCreditFor,
  pickedStructure,
  placeLabels,
  releaseNoteFor,
  pickQuizTarget,
  revealQuiz,
  revealedQuizTarget,
  slugify,
  startQuiz,
  systemKeyFromPath,
  toggleHidden,
  visibleSelection,
  wrapText,
  type LabelAnchor,
  type PlacedLabel,
  type VisibilityTarget,
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
    ['an unknown layer', { labels: [{ id: 'FMA1', text: 'a', source: 's', layer: 'bones' }] }, '"layer", when given'],
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

  it('a plain production build with no Workers variables excludes drafts and the fixture', () => {
    expect(draftsAllowed({})).toBe(false);
    expect(draftsAllowed({ CUEORY_ANATOMY_DRAFTS: '0' })).toBe(false);
    const draft = parseAnatomyFile(fixtureJson, 'tests/fixtures/anatomy-fixture.json', { fixture: true });
    const data = labDataForBuild({}, fixtureJson, {});
    expect(data.fixture).toBeNull();
    expect(data.drafts).toBe(false);
    expect(JSON.stringify(data)).not.toContain(draft.structures[0]!.text);
  });

  it('shows drafts only with the explicit local flag outside Workers Builds', () => {
    expect(draftsAllowed({ CUEORY_ANATOMY_DRAFTS: '1' })).toBe(true);
    expect(draftsAllowed({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', CUEORY_ANATOMY_DRAFTS: '1' })).toBe(false);
  });

  it('shows drafts on staging and branch previews', () => {
    expect(draftsAllowed({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(true);
    expect(draftsAllowed({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/anatomy-lab' })).toBe(true);
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
      { CUEORY_ANATOMY_DRAFTS: '1' },
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

  it('keeps a hidden selection named but stops dimming the other structures', () => {
    // The name card can still say which structure was selected, but the
    // renderer must have no active highlight while that structure is hidden.
    expect(visibleSelection('A', new Set())).toBe('A');
    expect(visibleSelection('A', new Set(['B']))).toBe('A');
    expect(visibleSelection('A', new Set(['A']))).toBeNull();
    expect(visibleSelection(null, new Set())).toBeNull();

    const hiddenFromList = toggleHidden(new Set<string>(), 'A');
    expect(visibleSelection('A', hiddenFromList)).toBeNull();
    // Showing the same structure again restores its highlight automatically.
    expect(visibleSelection('A', toggleHidden(hiddenFromList, 'A'))).toBe('A');
  });

  it('picks the opaque selected mesh through translucent geometry without biasing other taps', () => {
    const hits = ['outer-skin', 'inner-organ'];
    // Ray intersections are ordered nearest first. The selected inner mesh
    // is still visibly highlighted through the translucent outer skin.
    expect(pickedStructure(hits, 'inner-organ')).toBe('inner-organ');
    // A selected structure outside the ray is not sticky.
    expect(pickedStructure(hits, 'unrelated')).toBe('outer-skin');
    expect(pickedStructure(hits, null)).toBe('outer-skin');
    // A hidden selection is never treated as a visible highlight.
    expect(pickedStructure(hits, visibleSelection('inner-organ', new Set(['inner-organ'])))).toBe('outer-skin');
    expect(pickedStructure([], 'inner-organ')).toBeNull();
    // In quiz mode the caller passes null, so the nearest visible mesh wins.
    expect(pickedStructure(hits, null)).toBe('outer-skin');
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
      state = nextQuiz(answerQuiz(state, state.target!), random);
      asked.push(state.target);
    }
    expect(new Set(asked).size).toBe(pool.length);
    expect(asked.sort()).toEqual([...pool].sort());
    state = nextQuiz(answerQuiz(state, state.target!), random);
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

  it('protects only a correctly found or revealed quiz answer, not a wrong guess', () => {
    const state = startQuiz(pool, () => 0); // target A
    expect(revealedQuizTarget(null)).toBeNull();
    expect(revealedQuizTarget(state)).toBeNull();
    expect(revealedQuizTarget(answerQuiz(state, 'B'))).toBeNull();
    expect(revealedQuizTarget(answerQuiz(state, 'A'))).toBe('A');
    expect(revealedQuizTarget(revealQuiz(state))).toBe('A');
    expect(revealedQuizTarget({ target: null, feedback: { kind: 'shown' } })).toBeNull();
  });

  it('"show me" reveals and counts an unanswered question as answered, not right', () => {
    let state = startQuiz(pool, () => 0);
    state = revealQuiz(state);
    expect(state.feedback).toEqual({ kind: 'shown' });
    expect(state).toMatchObject({ right: 0, answered: 1 });
    expect(answerQuiz(state, 'A')).toBe(state);
    state = nextQuiz(state, () => 0);
    expect(state.target).toBe('B');
    expect(state.feedback).toBeNull();
  });

  it('"next" before answering counts the skipped question once', () => {
    let state = startQuiz(pool, () => 0);
    state = nextQuiz(state, () => 0);
    expect(state).toMatchObject({ answered: 1, right: 0, target: 'B' });
  });

  it('keeps the original round even if a caller later hides or reveals structures', () => {
    const original = ['A', 'B', 'C'];
    let state = startQuiz(original, () => 0);
    original.splice(1, 2, 'D', 'E');
    expect(state.pool).toEqual(['A', 'B', 'C']);
    state = nextQuiz(state, () => 0);
    expect(state.target).toBe('B');
    state = nextQuiz(state, () => 0);
    expect(state.target).toBe('C');
    state = nextQuiz(state, () => 0);
    expect(state.target).toBeNull();
    expect(state.asked).toEqual(['A', 'B', 'C']);
    expect(state.answered).toBe(3);
  });

  it('does not ask duplicate structure IDs twice within a round', () => {
    let state = startQuiz(['A', 'A', 'B'], () => 0);
    expect(state.pool).toEqual(['A', 'B']);
    expect(state.target).toBe('A');
    state = nextQuiz(state, () => 0);
    expect(state.target).toBe('B');
    state = nextQuiz(state, () => 0);
    expect(state.target).toBeNull();
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

  it('skips a label wider than the view and an anchor that did not project, and names them as left out', () => {
    expect(layoutLabels([{ id: 'wide', x: 10, y: 10, width: 500, height: 20 }], { width: 320, height: 200 })).toEqual([]);
    expect(layoutLabels([{ id: 'nan', x: Number.NaN, y: 10, width: 50, height: 20 }], { width: 320, height: 200 })).toEqual([]);
    expect(placeLabels([{ id: 'wide', x: 10, y: 10, width: 500, height: 20 }], { width: 320, height: 200 }).leftOut).toEqual(['wide']);
  });

  it('labels all seven structures of the wide lungs picture that used to lose one (QA, Task 178)', () => {
    // The geometry of the old wide export (/tmp/t178-shots/15): a 1920 × 589 view, 96 px boxes, seven anchors, four of
    // them right of the model's middle. The old slot search left "lower lobe of right lung" (lrl) out.
    const at = (id: string, x: number, y: number, width: number): LabelAnchor => ({ id, x, y, width, height: 96 });
    const anchors = [
      at('trachea', 960, 137, 230), at('url', 867, 217, 590), at('ull', 1057, 272, 560), at('bronchus', 963, 305, 270),
      at('ml', 860, 360, 490), at('lll', 1070, 360, 560), at('lrl', 870, 455, 590),
    ];
    const options = { width: 1920, height: 589, margin: 42, offset: 71, gap: 14, columns: { left: 760, right: 1160 } };
    const { placed, leftOut } = placeLabels(anchors, options);
    expect(leftOut).toEqual([]);
    expect(placed.map((p) => p.id).sort()).toEqual(anchors.map((a) => a.id).sort());
    for (const a of placed) for (const b of placed) if (a !== b) expect(overlap(a, b)).toBe(false);
    for (const p of placed) expect(p.y + p.height).toBeLessThanOrEqual(589 - 42);
  });

  it('keeps the labels of one side in their anchors\' top-to-bottom order, so leader lines do not cross', () => {
    const anchors: LabelAnchor[] = [300, 120, 200, 160].map((y, i) => ({ id: `s${i}`, x: 400, y, width: 80, height: 40 }));
    const placed = layoutLabels(anchors, { width: 500, height: 400 });
    const byAnchor = [...placed].sort((a, b) => a.anchorY - b.anchorY).map((p) => p.id);
    const byBox = [...placed].sort((a, b) => a.y - b.y).map((p) => p.id);
    expect(byBox).toEqual(byAnchor);
  });

  it('moves a label to the other side when its own side is full, and leaves out labels only when both are', () => {
    // Three 80 px boxes fit one 284 px column (8 px margins); the fourth goes to the other side.
    const four: LabelAnchor[] = [50, 100, 150, 200].map((y, i) => ({ id: `r${i}`, x: 250 + i, y, width: 60, height: 80 }));
    const moved = placeLabels(four, { width: 400, height: 300 });
    expect(moved.leftOut).toEqual([]);
    expect(moved.placed.filter((p) => p.x < 200)).toHaveLength(1);
    // Eight boxes: three a side fit, two are left out and named.
    const eight: LabelAnchor[] = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, x: i < 4 ? 150 : 250, y: 30 * i, width: 60, height: 80 }));
    const full = placeLabels(eight, { width: 400, height: 300 });
    expect(full.placed).toHaveLength(6);
    expect(full.leftOut).toHaveLength(2);
    expect(leftOutNote(['lower lobe of right lung'])).toBe('no room to label: lower lobe of right lung.');
    expect(leftOutNote([])).toBe('');
  });

  it('keeps the "behind" mark of an anchor', () => {
    const [p] = layoutLabels([{ id: 'b', x: 300, y: 100, width: 80, height: 30, behind: true }], { width: 500, height: 300 });
    expect(p!.behind).toBe(true);
    expect(layoutLabels([{ id: 'v', x: 300, y: 100, width: 80, height: 30 }], { width: 500, height: 300 })[0]!.behind).toBe(false);
  });

  it('wraps a long name and marks a hidden structure in words', () => {
    const measure = (s: string) => s.length * 10;
    expect(labelLines('one two three four', false, 100, measure)).toEqual({ lines: ['one two', 'three four'], mark: 'none', width: 100 });
    expect(labelLines('one', true, 200, measure)).toEqual({ lines: ['one'], mark: 'inline', width: measure(`one ${BEHIND_MARK}`) });
    expect(labelLines('one two three four', true, 100, measure)).toMatchObject({ lines: ['one two', 'three four'], mark: 'line' });
  });
});

describe('what the camera can see (the ID picture)', () => {
  /** A 4 × 3 RGBA picture, rows bottom-up as readPixels gives them, from a top-down grid of structure codes. */
  function picture(rows: number[][]): Uint8Array {
    const height = rows.length;
    const width = rows[0]!.length;
    const bytes = new Uint8Array(width * height * 4);
    rows.forEach((row, y) =>
      row.forEach((code, x) => {
        const i = ((height - 1 - y) * width + x) * 4;
        bytes.set([code & 255, (code >> 8) & 255, (code >> 16) & 255, 255], i);
      }),
    );
    return bytes;
  }

  it('codes each structure as its index + 1, so 0 means nothing', () => {
    expect(encodeId(0)).toEqual([1, 0, 0]);
    expect(encodeId(300)).toEqual([45, 1, 0]);
  });

  it('keeps the center when it can be seen, finds a visible point when it is covered, and marks a hidden one', () => {
    const px = picture([
      [1, 1, 2, 2],
      [1, 1, 2, 3],
      [0, 0, 2, 3],
    ]);
    const targets = new Map<string, VisibilityTarget>([
      ['a', { index: 0, x: 0.4, y: 0.6 }], // center on its own pixel
      ['b', { index: 1, x: 0, y: 2 }], // center covered by nothing it owns: its visible pixels are in column 2
      ['c', { index: 2, x: 1, y: 1 }], // center covered by a; two pixels show, fewer than the minimum
      ['d', { index: 3, x: 2, y: 1 }], // never drawn: entirely behind
    ]);
    const found = findVisibleAnchors(px, 4, 3, targets, 3);
    expect(found.get('a')).toEqual({ visible: true, x: 0.4, y: 0.6 });
    expect(found.get('b')).toMatchObject({ visible: true, x: 2 });
    expect(found.get('c')).toEqual({ visible: false, x: 1, y: 1 });
    expect(found.get('d')).toEqual({ visible: false, x: 2, y: 1 });
    expect(findVisibleAnchors(px, 4, 3, new Map([['c', targets.get('c')!]]), 2).get('c')).toMatchObject({ visible: true, x: 3 });
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
    const phone = exportRegion(extent, view, 9 / 16);
    expect(phone.width / phone.height).toBeCloseTo(9 / 16, 6);
    // centred on the model, and holds all of it
    expect(phone.x + phone.width / 2).toBeCloseTo(800, 6);
    expect(phone.y + phone.height / 2).toBeCloseTo(450, 6);
    expect(phone.x).toBeLessThanOrEqual(700);
    expect(phone.y).toBeLessThanOrEqual(300);
    expect(phone.x + phone.width).toBeGreaterThanOrEqual(900);
    expect(phone.y + phone.height).toBeGreaterThanOrEqual(600);
    const withLabels = exportRegion(extent, view, 9 / 16, { left: 0.3, right: 0.3 });
    expect(withLabels.width).toBeGreaterThan(phone.width);
  });

  it('fills a phone picture with a tall model from top to bottom (QA, Task 178)', () => {
    // A tall model (200 × 600 on screen) in a 9:16 picture: its height decides, with only the padding above and below.
    const view = { width: 1600, height: 900 };
    const tall = exportRegion({ x: 700, y: 150, width: 200, height: 600 }, view, 9 / 16);
    expect(600 / tall.height).toBeCloseTo(1 - 2 * EXPORT_PAD.y, 6);
    // With one label column, the model moves over to make room for it, and still fills the height.
    const oneSide = exportRegion({ x: 700, y: 150, width: 200, height: 600 }, view, 9 / 16, { left: 0.3, right: 0 });
    expect(600 / oneSide.height).toBeCloseTo(1 - 2 * EXPORT_PAD.y, 6);
    const modelMiddle = (800 - oneSide.x) / oneSide.width;
    expect(modelMiddle).toBeGreaterThan(0.5);
  });

  it('gives each label column room for its widest label', () => {
    const anchors = [{ x: 100, width: 200 }, { x: 120, width: 300 }, { x: 600, width: 100 }];
    expect(labelRoomFor(anchors, 400, 1000, 50)).toEqual({ left: 0.35, right: 0.15 });
    expect(labelRoomFor([], 400, 1000, 50)).toEqual({ left: 0, right: 0 });
  });

  it('uses only the part of the model that is on screen, or the whole view when none is', () => {
    const view = { width: 1000, height: 1000 };
    const whole = 1000 / (1 - 2 * EXPORT_PAD.y); // the tighter way round: the height, with its padding
    const clipped = exportRegion({ x: -5000, y: -5000, width: 20000, height: 20000 }, view, 1);
    expect(clipped.width).toBeCloseTo(whole, 6);
    expect(clipped.x + clipped.width / 2).toBeCloseTo(500, 6);
    const offScreen = exportRegion({ x: 2000, y: 2000, width: 10, height: 10 }, view, 1);
    expect(offScreen.x + offScreen.width / 2).toBeCloseTo(500, 6);
    expect(exportRegion(null, view, 1).width).toBeCloseTo(whole, 6);
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
    expect(tall).toBeCloseTo((5 / tan) * FIT_MARGIN + 1, 6);
    const wide = fitDistance({ x: 10, y: 1, z: 0 }, 35, 0.5);
    expect(wide).toBeCloseTo((5 / (tan * 0.5)) * FIT_MARGIN, 6);
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
