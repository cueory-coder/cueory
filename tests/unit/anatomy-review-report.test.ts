import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { anatomyInventory, anatomyReviewMarkdown } from '../../scripts/anatomy-review-report.mjs';

/** Fake model names and source lines only; no clinical content or answer keys in a public test. */
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-review-'));
  roots.push(root);
  mkdirSync(join(root, 'content', 'visuals'), { recursive: true });
  mkdirSync(join(root, 'public', 'models', 'anatomy'), { recursive: true });
  return root;
}

function source() {
  return {
    id: 'sample-FMA1',
    quote: 'FMA1 BP1 sample part | with punctuation',
    book: 'BodyParts3D',
    section: 'sample_parts_list_e.txt',
    url: 'https://example.org/sample',
    license: 'CC BY 4.0',
  };
}

function visual(id = 'sample', labelId = 'FMA1') {
  return {
    kind: 'model', title: `sample ${id}`, status: 'draft',
    model: { file: `/models/anatomy/${id}.glb`, release: 'sample release' },
    labels: [{ id: labelId, text: 'sample part | exact', group: 'sample group', layer: 'organs', source: 'sample-FMA1' }],
    sources: [source()],
  };
}

function writeSystem(root: string, id: string, data = visual(id)) {
  writeFileSync(join(root, 'content', 'visuals', `anatomy-${id}.json`), JSON.stringify(data));
  writeFileSync(join(root, 'public', 'models', 'anatomy', `${id}.glb`), Buffer.alloc(4096));
}

describe('read-only anatomy review inventory', () => {
  it('reads a draft and its cited label without altering the name, quote or status', () => {
    const root = setup();
    writeSystem(root, 'sample');
    const [entry] = anatomyInventory(root);
    expect(entry).toMatchObject({
      id: 'sample', status: 'draft', bytes: 4096, path: '/models/anatomy/sample.glb',
      labels: [{ id: 'FMA1', name: 'sample part | exact', layer: 'organs', source: { quote: 'FMA1 BP1 sample part | with punctuation' } }],
    });
    const report = anatomyReviewMarkdown(anatomyInventory(root));
    expect(report).toContain('sample part \\| exact');
    expect(report).toContain('FMA1 BP1 sample part \\| with punctuation');
    expect(report).toContain('[BodyParts3D, sample_parts_list_e.txt](https://example.org/sample)');
    expect(report).toContain('4.0 KiB');
    expect(report).toContain('does not verify anatomy geometry or approve a draft');
  });

  it('lists all systems in a stable file-name order and can select just one', () => {
    const root = setup();
    writeSystem(root, 'zeta', visual('zeta', 'FMA2'));
    writeSystem(root, 'alpha', visual('alpha', 'FMA1'));
    expect(anatomyInventory(root).map((item: { id: string }) => item.id)).toEqual(['alpha', 'zeta']);
    expect(anatomyInventory(root, 'zeta').map((item: { id: string }) => item.id)).toEqual(['zeta']);
    expect(() => anatomyInventory(root, 'not-here')).toThrow('No anatomy source file');
  });

  it('refuses duplicate structure identifiers across source files', () => {
    const root = setup();
    writeSystem(root, 'alpha', visual('alpha', 'FMA1'));
    writeSystem(root, 'beta', visual('beta', 'FMA1'));
    expect(() => anatomyInventory(root)).toThrow('anatomy-beta.json: structure id repeated: FMA1');
  });

  it('refuses a missing or unsafe model file path', () => {
    const root = setup();
    writeSystem(root, 'sample', { ...visual(), model: { file: '../outside.glb', release: 'sample' } });
    expect(() => anatomyInventory(root)).toThrow('model.file must be a local');
    writeSystem(root, 'sample', { ...visual(), model: { file: '/models/anatomy/absent.glb', release: 'sample' } });
    expect(() => anatomyInventory(root)).toThrow('model file missing');
  });

  it('refuses a missing source record and an unsafe source link', () => {
    const root = setup();
    writeSystem(root, 'sample', { ...visual(), sources: [] });
    expect(() => anatomyInventory(root)).toThrow('has no cited source');
    writeSystem(root, 'sample', { ...visual(), sources: [{ ...source(), url: 'javascript:alert(1)' }] });
    expect(() => anatomyInventory(root)).toThrow('must be a safe HTTPS URL');
  });

  it('refuses repeated source IDs, unknown layers and incomplete citations', () => {
    const root = setup();
    writeSystem(root, 'sample', { ...visual(), sources: [source(), source()] });
    expect(() => anatomyInventory(root)).toThrow('source id repeated');
    writeSystem(root, 'sample', { ...visual(), labels: [{ ...visual().labels[0], layer: 'made-up' }] });
    expect(() => anatomyInventory(root)).toThrow('no recognized layer');
    writeSystem(root, 'sample', { ...visual(), sources: [{ ...source(), quote: '' }] });
    expect(() => anatomyInventory(root)).toThrow('source quote must be nonempty text');
  });

  it('does not allow path separators or other input inside a requested system ID', () => {
    const root = setup();
    writeSystem(root, 'sample');
    for (const bad of ['../secret', 'ABC', 'a/b', '', '--help']) {
      expect(() => anatomyInventory(root, bad)).toThrow('system must be a lowercase anatomy file ID');
    }
  });

  it('keeps zero-count layers out and lists reviewer gates without granting approval', () => {
    const root = setup();
    writeSystem(root, 'sample');
    const report = anatomyReviewMarkdown(anatomyInventory(root));
    expect(report).toContain('| organs | 1 |');
    expect(report).not.toContain('| skin | 0 |');
    expect(report).toContain('Keep the source status as `draft` until the founder approves publication.');
  });
});
