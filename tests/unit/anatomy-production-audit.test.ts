import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditAnatomyProduction, modelUrls } from '../../scripts/anatomy-production-audit.mjs';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-publish-'));
  roots.push(root);
  const dist = join(root, 'dist');
  const content = join(root, 'content', 'visuals');
  mkdirSync(dist, { recursive: true });
  mkdirSync(content, { recursive: true });
  const file = (path: string, body = '') => {
    const dest = join(dist, path);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, body);
  };
  const system = (name: string, status: 'draft' | 'approved' | 'other', urls: string[], ids: string[] = []) => {
    writeFileSync(join(content, `anatomy-${name}.json`), JSON.stringify({
      status,
      model: { file: urls[0], files: urls.slice(1) },
      labels: ids.map((id) => ({ id, text: 'fixture label', source: `bp3d-${id}` })),
      sources: ids.map((id) => ({ id: `bp3d-${id}` })),
    }));
  };
  system('draft', 'draft', ['/models/anatomy/draft.glb'], ['FMA999991']);
  system('approved', 'approved', ['/models/anatomy/approved.glb'], ['FMA999992']);
  file('models/anatomy/approved.glb', 'fixture only');
  file('preview/anatomy-lab.html', '<html><meta name="robots" content="noindex"></html>');
  return { dist, content, file, system, check: () => auditAnatomyProduction(dist, content) };
}

describe('anatomy production artifact audit', () => {
  it('accepts a build with approved models and no exposed drafts', () => {
    expect(setup().check()).toEqual({ errors: [], approvedSystems: 1, draftSystems: 1, shippedModels: 1 });
  });

  it('rejects approved sources with missing, duplicate or unsupported structure IDs', () => {
    const f = setup();
    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], []);
    expect(f.check().errors).toContain('anatomy-approved.json: approved labels are missing');

    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], ['FMA999992', 'FMA999992', 'not-a-structure-id']);
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: duplicate approved label ID FMA999992',
      'anatomy-approved.json: invalid approved label ID',
    ]));
  });

  it('rejects approved structure names without an official name or source citation', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [
        { id: 'FMA999992', text: ' ', source: 'bp3d-FMA999992' },
        { id: 'FMA999993', text: 'fixture only', source: '' },
      ],
      sources: [{ id: 'bp3d-FMA999992' }],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: approved label FMA999992 has no official name',
      'anatomy-approved.json: approved label FMA999993 has no source citation',
    ]));
  });

  it('rejects missing source records and source IDs absent from an approved manifest', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'orphan-source' }],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: approved source records are missing',
      'anatomy-approved.json: approved label FMA999992 references unknown source orphan-source',
    ]));

    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'orphan-source' }],
      sources: [{ id: 'valid-source' }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved label FMA999992 references unknown source orphan-source',
    );
  });

  it('rejects an invalid or duplicated approved source record identifier', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'valid-source' }],
      sources: [{ id: 'valid-source' }, { id: 'valid-source' }, { id: '' }],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: duplicate approved source ID valid-source',
      'anatomy-approved.json: invalid approved source ID',
    ]));
  });

  it('rejects a label citing another structure even when that source exists', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [
        { id: 'FMA999992', text: 'fixture only', source: 'bp3d-FMA999993' },
      ],
      sources: [{ id: 'bp3d-FMA999993' }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved label FMA999992 source does not match structure ID',
    );
  });

  it('rejects a properly formatted citation if its source object is missing', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [
        { id: 'FMA999992', text: 'fixture only', source: 'bp3d-FMA999992' },
      ],
      sources: [],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: approved source records are missing',
      'anatomy-approved.json: approved label FMA999992 references unknown source bp3d-FMA999992',
    ]));
  });

  it('rejects a directly fetchable draft model even if the anatomy page is clean', () => {
    const f = setup();
    f.file('models/anatomy/draft.glb', 'fixture');
    expect(f.check().errors).toContain('unapproved model exposed in production: /models/anatomy/draft.glb');
  });

  it('rejects missing approved models and stray models', () => {
    const f = setup();
    rmSync(join(f.dist, 'models', 'anatomy', 'approved.glb'));
    f.file('models/anatomy/stray.glb', 'fixture');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'unapproved model exposed in production: /models/anatomy/stray.glb',
      'approved model missing from production: /models/anatomy/approved.glb',
    ]));
  });

  it('rejects a fixture endpoint even when no draft model is present', () => {
    const f = setup();
    f.file('preview/anatomy-fixture/fixture.glb', 'fixture');
    expect(f.check().errors).toContain('test fixture exposed in production: /preview/anatomy-fixture/fixture.glb');
  });

  it('rejects draft IDs serialized into the anatomy page or JavaScript assets', () => {
    const f = setup();
    f.file('preview/anatomy-lab.html', '<div>FMA999991</div>');
    f.file('_astro/study.js', 'const label="FMA999991";');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: preview/anatomy-lab.html (FMA999991)',
      'draft anatomy ID exposed in built text: _astro/study.js (FMA999991)',
    ]));
  });

  it('avoids false positives from longer or unrelated structure identifiers', () => {
    const f = setup();
    f.file('preview/anatomy-lab.html', '<div>FMA9999910</div>');
    f.file('other.html', '<div>FMA999992</div>');
    expect(f.check().errors).toEqual([]);
  });

  it('rejects draft identifiers on unrelated pages, in search data and in SVG exports', () => {
    const f = setup();
    f.file('index.html', '<div>FMA999991</div>');
    f.file('pagefind/pagefind-entry.json', '{"id":"FMA999991"}');
    f.file('images/structure.svg', '<svg><title>FMA999991</title></svg>');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: index.html (FMA999991)',
      'draft anatomy ID exposed in built text: pagefind/pagefind-entry.json (FMA999991)',
      'draft anatomy ID exposed in built text: images/structure.svg (FMA999991)',
    ]));
  });

  it('fails closed when a draft has no labels or an unsupported identifier format', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/draft.glb'], []);
    f.system('badid', 'draft', ['/models/anatomy/badid.glb'], ['local-sample']);
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-draft.json: draft labels are missing',
      'anatomy-badid.json: invalid draft label ID',
    ]));
  });

  it('rejects a model shared by an approved and a draft record', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/approved.glb'], ['FMA999991']);
    expect(f.check().errors).toContain('ambiguous approval: /models/anatomy/approved.glb is also referenced by a draft');
  });

  it('fails closed on invalid status, invalid model URL and malformed JSON', () => {
    const f = setup();
    f.system('invalid', 'other', ['/models/anatomy/other.glb']);
    f.system('badpath', 'draft', ['/models/anatomy/../approved.glb']);
    writeFileSync(join(f.content, 'anatomy-broken.json'), '{oops');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-invalid.json: invalid publication status',
      'anatomy-badpath.json: invalid model URL list',
      'anatomy-broken.json: cannot read valid JSON',
    ]));
  });

  it('refuses a missing dist or source folder', () => {
    const f = setup();
    expect(auditAnatomyProduction(join(f.dist, 'not-built'), f.content).errors[0]).toMatch(/production output does not exist/);
    expect(auditAnatomyProduction(f.dist, join(f.content, 'missing')).errors[0]).toMatch(/anatomy source directory does not exist/);
  });

  it('validates all model URL fields without accepting traversal or off-site data', () => {
    expect(modelUrls({ file: '/models/anatomy/a.glb', layerFiles: { organs: ['/models/anatomy/b.glb'] } })).toEqual([
      '/models/anatomy/a.glb', '/models/anatomy/b.glb',
    ]);
    expect(modelUrls({ file: 'https://example.com/a.glb' })).toBeNull();
    expect(modelUrls({ file: '/models/anatomy/../../secret.glb' })).toBeNull();
    expect(modelUrls({ file: '/models/anatomy/a.glb', files: 'other.glb' })).toBeNull();
  });
});

/** CI builds dist/ before running unit tests. Audit those real files, not only synthetic examples. */
describe('built production artifact gate', () => {
  it('checks the actual dist output in CI, unless this was explicitly a draft preview build', () => {
    if (process.env.CI !== 'true') return;
    const workersBranch = process.env.WORKERS_CI_BRANCH?.trim();
    const preview = process.env.CUEORY_ANATOMY_DRAFTS === '1' ||
      (process.env.WORKERS_CI === '1' && !!workersBranch && workersBranch !== 'main');
    if (preview) return;
    // A missing dist/ is an error, too. The CI workflow runs npm run build before npm test.
    expect(auditAnatomyProduction('dist', 'content/visuals').errors).toEqual([]);
  });
});
