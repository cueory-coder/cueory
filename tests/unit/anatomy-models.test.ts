import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
          // The quote is the parts-list line "id<tab>name" with the tab shown as one space.
          expect(source?.quote).toBe(`${label.id} ${label.text}`);
          expect(label.group, label.id).toBeTruthy();
        }
      });
    });
  }
});
