import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ancestorsOf, commonParent, GROUP_MIN, GROUP_SPLIT_ABOVE, groupHeadings } from '../../scripts/anatomy-groups.mjs';
import { MAX_SIZE_BYTES, MAX_TRIANGLES } from '../../src/islands/bodyviewer-logic';
import {
  allowedBooks,
  glbJson,
  glbNodeNames,
  glbTriangles,
  modelFileProblems,
  modelLabelProblems,
  visualProblems,
  type Visual,
} from '../../src/visuals/sources';

/**
 * The anatomy lab's 3D models (Task 177, docs/VISUALS.md "3D body"). Each model in public/models/anatomy is built by
 * scripts/build-anatomy.mjs from BodyParts3D, and its source file content/visuals/anatomy-<system>.json names every
 * structure with the parts list's own English name. These checks read only the GLB's JSON chunk: no three.js needed.
 */

/** A small GLB file with the given JSON and no binary chunk. */
function glb(json: object): Uint8Array {
  let text = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  text = padded;
  const bytes = new Uint8Array(20 + text.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(text, 20);
  return bytes;
}

const BODYPARTS3D = allowedBooks.find((book) => book.book === 'BodyParts3D')!;

/** Test data in the shape of a model's source file: the id and name are placeholders, not a real structure. */
const sampleModel = (): Visual => ({
  id: 'anatomy-sample',
  title: 'sample model',
  kind: 'model',
  lessonIds: ['U01-T01-L01'],
  status: 'draft',
  model: { file: '/models/anatomy/sample.glb', release: 'sample release' },
  labels: [{ id: 'FMA1', text: 'sample structure', group: 'sample group', source: 'bp3d-FMA1' }],
  depictions: [],
  sources: [
    {
      id: 'bp3d-FMA1',
      quote: 'FMA1 sample structure',
      book: 'BodyParts3D',
      section: 'parts_list_e.txt',
      url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html',
      license: 'CC BY 4.0',
      retrieved: '2026-11-02',
    },
  ],
});

describe('BodyParts3D as a source', () => {
  it("gives the license page's credit word for word", () => {
    expect(BODYPARTS3D.credit).toBe(
      'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
    );
    expect(BODYPARTS3D.license).toBe('CC BY 4.0');
    expect(BODYPARTS3D.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('passes in a 3D model', () => {
    expect(visualProblems(sampleModel())).toEqual([]);
  });

  it('is refused in a diagram or an overlay', () => {
    for (const kind of ['diagram', 'overlay'] as const) {
      const visual: Visual = { ...sampleModel(), kind };
      delete visual.model;
      expect(visualProblems(visual).map((problem) => problem.message)).toEqual([
        `source "bp3d-FMA1" quotes BodyParts3D, which only a visual of kind "model" may quote, not a "${kind}"`,
      ]);
    }
  });
});

describe('the model field', () => {
  it('is required for a 3D model and refused elsewhere', () => {
    const withoutModel = sampleModel();
    delete withoutModel.model;
    expect(visualProblems(withoutModel)).toEqual([{ field: 'model', message: 'a 3D model visual needs "model": the model file it labels' }]);
    expect(visualProblems({ ...sampleModel(), kind: 'diagram' })).toContainEqual({
      field: 'model',
      message: 'only a 3D model visual has "model", not a diagram',
    });
  });

  it('names a .glb file under /models/', () => {
    for (const file of ['/models/anatomy/heart.gltf', 'models/anatomy/heart.glb', '/brand/heart.glb', '/models/../x.glb', '/models/Heart.glb']) {
      const visual = sampleModel();
      visual.model = { file, release: 'r' };
      expect(visualProblems(visual).map((problem) => problem.field), file).toEqual(['model']);
    }
  });

  it('must point to a file that exists under public/', () => {
    expect(modelFileProblems(sampleModel(), (path) => path === 'models/anatomy/sample.glb')).toEqual([]);
    expect(modelFileProblems(sampleModel(), () => false)).toEqual([
      { field: 'model', message: "the model file public/models/anatomy/sample.glb doesn't exist" },
    ]);
  });
});

describe("reading a GLB file's JSON", () => {
  it('gives the node names and the triangle count', () => {
    const bytes = glb({
      nodes: [{ name: 'FMA1', mesh: 0 }, { name: 'FMA2', mesh: 1 }],
      meshes: [{ primitives: [{ indices: 0 }] }, { primitives: [{ indices: 1 }] }],
      accessors: [{ count: 30 }, { count: 6 }],
    });
    expect(glbNodeNames(bytes)).toEqual(['FMA1', 'FMA2']);
    expect(glbTriangles(bytes)).toBe(12);
  });

  it('refuses a file that is not GLB', () => {
    expect(() => glbJson(new TextEncoder().encode('{"nodes":[]} not a glb file'))).toThrow('not a GLB version 2 file');
  });
});

describe('matching model nodes and labels', () => {
  it('passes when every node has exactly one label and every label names a node', () => {
    expect(modelLabelProblems(sampleModel(), ['FMA1'])).toEqual([]);
  });

  it('names nodes without a label, labels without a node, and repeats', () => {
    const visual = sampleModel();
    visual.labels = [...visual.labels, { ...visual.labels[0]! }, { id: 'FMA3', text: 'x', source: 'bp3d-FMA1' }];
    expect(modelLabelProblems(visual, ['FMA1', 'FMA2', 'FMA2'])).toEqual([
      'node "FMA1" has 2 labels',
      '2 nodes are named "FMA2"',
      'node "FMA2" has no label',
      'label "FMA3" names no node in the model',
    ]);
  });
});

describe('list headings from the hierarchy (scripts/anatomy-groups.mjs)', () => {
  // A made-up tree with placeholder ids (not anatomy): T is part of nothing; R1 and R2 are a system's roots.
  //   T > R1 > A > a1, a2, a3        T > R1 > B > b1, b2        T > R1 > c1        T > R2
  const parents = new Map<string, string[]>([
    ['R1', ['T']], ['R2', ['T']],
    ['A', ['R1']], ['B', ['R1']], ['c1', ['R1']],
    ['a1', ['A']], ['a2', ['A']], ['a3', ['A']], ['b1', ['B']], ['b2', ['B']],
  ]);
  const structures = [
    { id: 'R2', path: ['R2'] },
    { id: 'c1', path: ['R1', 'c1'] },
    ...['a1', 'a2', 'a3'].map((id) => ({ id, path: ['R1', 'A', id] })),
    ...['b1', 'b2'].map((id) => ({ id, path: ['R1', 'B', id] })),
  ];

  it('walks up the tree nearest first', () => {
    expect(ancestorsOf('a1', parents)).toEqual(['A', 'R1', 'T']);
    expect(commonParent(['R1', 'R2'], parents)).toBe('T');
    expect(commonParent(['R1'], parents)).toBe('T');
  });

  it('keeps a small system under its root concepts', () => {
    expect(structures.length).toBeLessThanOrEqual(GROUP_SPLIT_ABOVE);
    expect(Object.fromEntries(groupHeadings(structures, ['R1', 'R2'], parents))).toEqual({
      R2: 'T', c1: 'R1', a1: 'R1', a2: 'R1', a3: 'R1', b1: 'R1', b2: 'R1',
    });
  });

  it(`splits a root that holds more than ${GROUP_SPLIT_ABOVE} structures, only into parts that hold at least ${GROUP_MIN}`, () => {
    // Ten more structures straight under R1 push it over the limit: A (3) becomes a heading, B (2) stays under R1.
    const extra = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, path: ['R1', `x${i}`] }));
    const headings = groupHeadings([...structures, ...extra], ['R1', 'R2'], parents);
    expect(headings.get('a1')).toBe('A');
    expect(headings.get('b1')).toBe('R1');
    expect(headings.get('c1')).toBe('R1');
    expect(headings.get('x0')).toBe('R1');
  });
});

const visualsDir = new URL('../../content/visuals/', import.meta.url);
const anatomyFiles = readdirSync(visualsDir).filter((file) => /^anatomy-[a-z0-9-]+\.json$/.test(file)).sort();
const systems = (
  JSON.parse(readFileSync(new URL('../../scripts/anatomy-systems.json', import.meta.url), 'utf8')) as {
    systems: { id: string; structures: string[] }[];
  }
).systems;

describe('the anatomy models', () => {
  it('has one source file for every system the build script defines', () => {
    expect(anatomyFiles).toEqual(systems.map((system) => `anatomy-${system.id}.json`).sort());
  });

  it('puts each structure in one system only, so the skeleton halves never repeat a bone', () => {
    const all = systems.flatMap((system) => system.structures);
    expect(new Set(all).size).toBe(all.length);
  });

  for (const file of anatomyFiles) {
    describe(file, () => {
      const visual = JSON.parse(readFileSync(new URL(file, visualsDir), 'utf8')) as Visual;
      const system = systems.find((candidate) => `anatomy-${candidate.id}.json` === file);
      const modelPath = new URL(`../../public${visual.model?.file ?? '/missing'}`, import.meta.url);

      it('is a draft 3D model whose file exists', () => {
        expect(visual.kind).toBe('model');
        expect(visual.status).toBe('draft');
        expect(visual.model?.file).toBe(`/models/anatomy/${system?.id}.glb`);
        expect(existsSync(modelPath)).toBe(true);
      });

      it('labels every node of the model exactly once, in the order the build script lists them', () => {
        const bytes = new Uint8Array(readFileSync(modelPath));
        expect(modelLabelProblems(visual, glbNodeNames(bytes))).toEqual([]);
        expect(glbNodeNames(bytes)).toEqual(system?.structures);
        expect(visual.labels.map((label) => label.id)).toEqual(system?.structures);
      });

      it('fits the phone budget, uses only the extensions the viewer decodes, and carries the credit', () => {
        const bytes = new Uint8Array(readFileSync(modelPath));
        expect(bytes.byteLength).toBeLessThanOrEqual(MAX_SIZE_BYTES);
        expect(glbTriangles(bytes)).toBeLessThanOrEqual(MAX_TRIANGLES);
        const json = glbJson(bytes);
        expect(json.extensionsRequired?.sort()).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization']);
        expect(json.asset?.copyright).toBe(BODYPARTS3D.credit);
      });

      it("shows each structure's name exactly as its parts-list line gives it", () => {
        const sources = new Map(visual.sources.map((source) => [source.id, source]));
        for (const label of visual.labels) {
          const source = sources.get(label.source);
          expect(source?.book, label.id).toBe('BodyParts3D');
          expect(label.source).toBe(`bp3d-${label.id}`);
          // The quote is the parts-list line with each tab shown as one space: "id name" in Release 3.0, and
          // "concept id, representation id, name" in Release 4.0 (scripts/anatomy-release4.mjs).
          if (visual.model?.release.startsWith('BodyParts3D 4.0')) {
            const [id, representation, ...name] = source!.quote.split(' ');
            expect([id, name.join(' ')]).toEqual([label.id, label.text]);
            expect(representation).toBeTruthy();
          } else {
            expect(source?.quote).toBe(`${label.id} ${label.text}`);
          }
          expect(label.group, label.id).toBeTruthy();
        }
      });

      it('puts every structure in one layer for peeling, named in scripts/anatomy-systems.json', () => {
        const layers = (JSON.parse(readFileSync(new URL('../../scripts/anatomy-systems.json', import.meta.url), 'utf8')) as {
          layers: { order: { id: string }[] };
        }).layers.order.map((layer) => layer.id);
        expect(layers).toEqual(['skin', 'muscle', 'nerves', 'vessels', 'organs', 'skeleton']);
        for (const label of visual.labels) expect(layers, label.id).toContain(label.layer);
      });

      it('groups the list under a few headings, not one or two structures each', () => {
        const sizes = new Map<string, number>();
        for (const label of visual.labels) sizes.set(label.group!, (sizes.get(label.group!) ?? 0) + 1);
        // Fewer headings than a third of the structures, and most structures under a heading of three or more.
        expect(sizes.size, [...sizes.keys()].join('; ')).toBeLessThanOrEqual(Math.ceil(visual.labels.length / 3));
        const inSmall = [...sizes.values()].filter((n) => n < GROUP_MIN).reduce((a, b) => a + b, 0);
        expect(inSmall, [...sizes].join('; ')).toBeLessThanOrEqual(visual.labels.length / 3);
      });
    });
  }
});
