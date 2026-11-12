import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { curriculumPreviewAllowed, curriculumStatus } from '../../src/lessons/curriculumstatus';
import { draftsAllowed, type BuildEnv } from '../../src/islands/anatomylab';
import type { MapUnit } from '../../src/islands/lessonmap';
import type { CatalogLesson } from '../../src/lessons/catalog';

const units: MapUnit[] = [
  {
    id: 'U01',
    title: '[sample unit]',
    topics: [{
      id: 'U01-T01',
      title: '[sample topic]',
      lessons: [
        { lesson_id: 'U01-T01-L01', title: '[sample lesson A]', row: 2 },
        { lesson_id: 'U01-T01-L02', title: '[sample lesson B]', row: 3 },
      ],
    }],
  },
];
const published = (curriculumId: string | undefined) => ({ curriculumId }) as Pick<CatalogLesson, 'curriculumId'>;

const builtPage = new URL('../../dist/preview/curriculum.html', import.meta.url);
// The project's unit suite follows the ordinary build. Preview browser tests
// build separately with the explicit draft flag.
describe('normal-build curriculum preview boundary', () => {
  it('shows only a closed notice without curriculum rows or serialized lesson IDs', () => {
    expect(existsSync(builtPage), 'run npm run build with draft flags unset before this unit test').toBe(true);
    const html = readFileSync(builtPage, 'utf8');
    expect(html).toContain('data-testid="curriculum-preview-closed"');
    expect(html).not.toContain('data-curriculum-lesson-id');
    expect(html).not.toContain('data-curriculum-unit');
    expect(html).not.toMatch(/U\d{2}-T\d{2}-L\d{2}/);
  });
});

describe('curriculum production-branch exclusion', () => {
  const cases: { name: string; env: BuildEnv; show: boolean }[] = [
    { name: 'live legacy/main Workers build', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'legacy/main' }, show: false },
    { name: 'full-ref legacy/main Workers build', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/legacy/main' }, show: false },
    { name: 'live main Workers build', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, show: false },
    { name: 'full-ref main Workers build', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' }, show: false },
    { name: 'missing Workers branch', env: { WORKERS_CI: '1' }, show: false },
    { name: 'blank Workers branch', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: ' ' }, show: false },
    { name: 'staging Workers preview', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, show: true },
    { name: 'task-branch Workers preview', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/task-769/curriculum-preview' }, show: true },
    { name: 'normal local build', env: {}, show: false },
    { name: 'explicit local draft build', env: { CUEORY_ANATOMY_DRAFTS: '1' }, show: true },
  ];
  for (const { name, env, show } of cases) {
    it(name, () => {
      expect(curriculumPreviewAllowed(draftsAllowed(env), env)).toBe(show);
    });
  }
  it('rejects both live branch aliases even if the shared gate mistakenly allows them', () => {
    for (const branch of ['legacy/main', 'refs/heads/legacy/main', 'main', 'refs/heads/main']) {
      expect(curriculumPreviewAllowed(true, { WORKERS_CI: '1', WORKERS_CI_BRANCH: branch })).toBe(false);
    }
  });
});

describe('curriculum build status', () => {
  it('marks a catalog lesson as built and counts it at every level', () => {
    const status = curriculumStatus(units, [published('U01-T01-L01')]);
    expect(status.lessonCount).toBe(2);
    expect(status.builtCount).toBe(1);
    expect(status.units[0]!.builtCount).toBe(1);
    expect(status.units[0]!.topics[0]!.builtCount).toBe(1);
    expect(status.units[0]!.topics[0]!.lessons[0]).toEqual({ id: 'U01-T01-L01', status: 'built' });
  });

  it('labels an unbuilt lesson in words without treating it as a link', () => {
    const status = curriculumStatus(units, []);
    expect(status.builtCount).toBe(0);
    expect(status.units[0]!.topics[0]!.lessons).toEqual([
      { id: 'U01-T01-L01', status: 'not built yet' },
      { id: 'U01-T01-L02', status: 'not built yet' },
    ]);
  });

  it('reports catalog entries absent from the curriculum map instead of counting them', () => {
    const status = curriculumStatus(units, [
      published('U99-T01-L01'), published('U01-T01-L01'), published('U88-T01-L01'),
    ]);
    expect(status.builtCount).toBe(1);
    expect(status.unmappedCatalogIds).toEqual(['U88-T01-L01', 'U99-T01-L01']);
  });

  it('ignores legacy catalog lessons that have no curriculum lesson ID', () => {
    const status = curriculumStatus(units, [published(undefined)]);
    expect(status.builtCount).toBe(0);
    expect(status.unmappedCatalogIds).toEqual([]);
  });

  it('retains unit, topic and lesson ID order and never copies lesson text', () => {
    const status = curriculumStatus(units, [published('U01-T01-L02')]);
    expect(status.units[0]!.title).toBe('[sample unit]');
    expect(status.units[0]!.topics[0]!.title).toBe('[sample topic]');
    expect(status.units[0]!.topics[0]!.lessons.map((lesson) => lesson.id))
      .toEqual(['U01-T01-L01', 'U01-T01-L02']);
    expect(JSON.stringify(status)).not.toContain('[sample lesson A]');
    expect(JSON.stringify(status)).not.toContain('[sample lesson B]');
  });

  it('does not mutate the supplied map or catalog', () => {
    const catalog = [published('U01-T01-L01')];
    const before = JSON.stringify({ units, catalog });
    curriculumStatus(units, catalog);
    expect(JSON.stringify({ units, catalog })).toBe(before);
  });

  it('handles an empty curriculum without inventing units or lessons', () => {
    expect(curriculumStatus([], [])).toEqual({
      units: [], lessonCount: 0, builtCount: 0, unmappedCatalogIds: [],
    });
  });

  it('counts duplicate catalog records only once for a mapped lesson', () => {
    const repeated = curriculumStatus(units, [
      published('U01-T01-L01'), published('U01-T01-L01'),
    ]);
    expect(repeated.lessonCount).toBe(2);
    expect(repeated.builtCount).toBe(1);
    expect(repeated.units[0]!.builtCount).toBe(1);
    expect(repeated.unmappedCatalogIds).toEqual([]);
  });

  it('counts independent units and topics without leaking lesson titles', () => {
    const multiUnit: MapUnit[] = [
      ...units,
      {
        id: 'U02',
        title: '[sample second unit]',
        topics: [{
          id: 'U02-T01',
          title: '[sample second topic]',
          lessons: [{
            lesson_id: 'U02-T01-L01',
            title: '[sample hidden lesson title]',
            row: 4,
          }],
        }],
      },
    ];
    const report = curriculumStatus(multiUnit, [
      published('U02-T01-L01'), published('U01-T01-L02'),
    ]);
    expect(report.units.map((unit) => [unit.id, unit.lessonCount, unit.builtCount])).toEqual([
      ['U01', 2, 1], ['U02', 1, 1],
    ]);
    expect(report.lessonCount).toBe(3);
    expect(report.builtCount).toBe(2);
    expect(JSON.stringify(report)).not.toContain('[sample hidden lesson title]');
  });
});
