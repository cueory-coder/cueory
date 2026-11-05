import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { systemsForView } from '../../src/islands/anatomylayers';
import type { AnatomySystem } from '../../src/islands/anatomylab';

const sample = (key: string, id: string): AnatomySystem => ({
  key,
  title: key,
  status: 'approved',
  model: { file: `/models/anatomy/${key}.glb`, release: 'test-release' },
  structures: [{ id, text: `test shape ${id}`, layer: 'skeleton' }],
});

const a = sample('a', 'A');
const b = sample('b', 'B');
const fixture: AnatomySystem = { ...sample('fixture', 'F'), fixture: true };

describe('compact anatomy lab hydration props', () => {
  it('does not construct a duplicate whole-body catalog until the lab is open', () => {
    expect(systemsForView([a, b], false).map((s) => s.key)).toEqual(['a', 'b']);
    const opened = systemsForView([a, b], true);
    expect(opened.map((s) => s.key)).toEqual(['a', 'b', 'whole-body']);
    expect(opened[2]!.structures.map((s) => s.id)).toEqual(['A', 'B']);
    // The per-system objects are kept rather than copied or changed.
    expect(opened[0]).toBe(a);
    expect(opened[1]).toBe(b);
  });

  it('puts an optional test fixture first but never copies it into the combined body', () => {
    expect(systemsForView([a, b], false, fixture).map((s) => s.key)).toEqual(['fixture', 'a', 'b']);
    const opened = systemsForView([a, b], true, fixture);
    expect(opened.map((s) => s.key)).toEqual(['fixture', 'a', 'b', 'whole-body']);
    expect(opened[3]!.structures.map((s) => s.id)).toEqual(['A', 'B']);
    expect(systemsForView([a], true, fixture).map((s) => s.key)).toEqual(['fixture', 'a']);
  });

  it('keeps the existing server-side draft gate before serialization to the React island', () => {
    const page = readFileSync(new URL('../../src/pages/preview/anatomy-lab.astro', import.meta.url), 'utf8');
    const component = readFileSync(new URL('../../src/islands/AnatomyLab.tsx', import.meta.url), 'utf8');
    expect(page).toContain('labDataForBuild(files, fixtureJson,');
    expect(page).toContain('systems={lab.systems}');
    expect(page).not.toContain('wholeBody(');
    expect(component).toContain("systemsForView(baseSystems, phase === 'open'");
    // This is a source-contract regression; browser tests still have to verify the real viewer.
  });
});
