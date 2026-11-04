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
      // Fake, test-only evidence. Never used as an anatomy quotation.
      sources: ids.map((id) => ({
        id: `bp3d-${id}`,
        quote: 'synthetic test words only',
        book: 'BodyParts3D',
        section: 'synthetic test section',
        url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/synthetic-test-only',
        license: 'CC BY 4.0',
        retrieved: '2026-11-04',
      })),
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

  it('reports null and primitive approved source records without crashing', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'bp3d-FMA999992' }],
      sources: [
        null, 7, [],
        {
          id: 'bp3d-FMA999992', quote: 'synthetic test words only',
          book: 'BodyParts3D', section: 'synthetic test section',
          url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/synthetic-test-only',
          license: 'CC BY 4.0', retrieved: '2026-11-04',
        },
      ],
    }));

    const result = f.check();
    expect(result.approvedSystems).toBe(1);
    expect(result.errors.filter((message) =>
      message === 'anatomy-approved.json: invalid approved source ID')).toHaveLength(3);
  });

  it('accepts canonical BP IDs and FMA IDs with lowercase suffixes for approved anatomy', () => {
    const f = setup();
    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], ['BP24', 'FMA7198nsn']);
    expect(f.check().errors).toEqual([]);
  });

  it('flags draft BP and suffixed FMA IDs in built text without matching longer tokens', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/draft.glb'], ['BP24', 'FMA7198nsn']);
    f.file('index.html', '<p>BP24 FMA7198nsn BP240 FMA7198nsna</p>');
    const errors = f.check().errors;
    expect(errors).toContain('draft anatomy ID exposed in built text: index.html (BP24)');
    expect(errors).not.toContain('anatomy-draft.json: invalid draft label ID');
    expect(errors.filter((e) => e.includes('draft anatomy ID exposed in built text: index.html'))).toHaveLength(1);
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
      // A corrupt null record must be reported instead of crashing the audit.
      sources: [null, { id: 'valid-source' }, { id: 'valid-source' }, { id: '' }],
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

  it('rejects an approved citation with a matching ID but missing quotation or section', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'bp3d-FMA999992' }],
      sources: [{
        id: 'bp3d-FMA999992', quote: '', book: 'BodyParts3D', section: '',
        url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/synthetic-test-only',
        license: 'CC BY 4.0', retrieved: '2026-11-04',
      }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence',
    );
  });

  it('rejects an approved source with unapproved licensing or off-site evidence', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'bp3d-FMA999992' }],
      sources: [{
        id: 'bp3d-FMA999992', quote: 'synthetic words', book: 'Other Atlas',
        section: 'synthetic test section', url: 'https://example.org/unverified',
        license: 'CC BY-NC 4.0', retrieved: 'invalid date',
      }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence',
    );
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

/**
 * Production audit must not be skipped for a full Git ref that names main.
 * Fail closed when Workers provides no branch or an empty refs/heads/ value.
 * This test gate is independent of the still-separate page/model pruning fix
 * (existing PR #487) and must catch leaked artifacts even before that lands.
 */
interface AuditBuildEnv {
  CI?: string;
  WORKERS_CI?: string;
  WORKERS_CI_BRANCH?: string;
  CUEORY_ANATOMY_DRAFTS?: string;
}

function shouldAuditBuiltAnatomy(env: AuditBuildEnv): boolean {
  if (env.CI !== 'true') return false;
  if (env.WORKERS_CI !== '1') return env.CUEORY_ANATOMY_DRAFTS !== '1';
  const ref = env.WORKERS_CI_BRANCH?.trim() ?? '';
  const branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
  return !branch || branch === 'main';
}

/** CI builds dist/ before unit tests. Audit actual files, not only synthetic examples. */
describe('built production artifact gate', () => {
  it.each([
    { name: 'short main', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, audit: true },
    { name: 'full main with a local draft override', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: ' refs/heads/main ', CUEORY_ANATOMY_DRAFTS: '1' }, audit: true },
    { name: 'missing branch', env: { CI: 'true', WORKERS_CI: '1' }, audit: true },
    { name: 'empty full ref', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/' }, audit: true },
    { name: 'normal CI', env: { CI: 'true' }, audit: true },
    { name: 'staging full ref', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/staging' }, audit: false },
    { name: 'feature preview', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/anatomy-lab' }, audit: false },
    { name: 'explicit local draft', env: { CI: 'true', CUEORY_ANATOMY_DRAFTS: '1' }, audit: false },
    { name: 'not in CI', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, audit: false },
  ])('$name: production artifact audit runs = $audit', ({ env, audit }) => {
    expect(shouldAuditBuiltAnatomy(env)).toBe(audit);
  });

  it('audits a full-ref main build and detects a leaked draft model', () => {
    const env = { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main', CUEORY_ANATOMY_DRAFTS: '1' };
    const fixture = setup();
    fixture.file('models/anatomy/draft.glb', 'synthetic test-only GLB');
    expect(shouldAuditBuiltAnatomy(env)).toBe(true);
    expect(fixture.check().errors).toContain(
      'unapproved model exposed in production: /models/anatomy/draft.glb',
    );
  });

  it('checks the actual dist output in CI unless this is an authorized draft build', () => {
    if (!shouldAuditBuiltAnatomy(process.env)) return;
    // A missing dist/ is an error, too. CI builds before running unit tests.
    expect(auditAnatomyProduction('dist', 'content/visuals').errors).toEqual([]);
  });
});
