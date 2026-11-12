import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { focusFromSearch, linkedStructureId } from '../../src/islands/anatomyviews';
import { parseAnatomyFile } from '../../src/islands/anatomylab';
import { systemsForView } from '../../src/islands/anatomylayers';

const directory = join(process.cwd(), 'content/visuals');
const baseSystems = readdirSync(directory).filter((name) => /^anatomy-.*\.json$/.test(name)).map((name) =>
  parseAnatomyFile(JSON.parse(readFileSync(join(directory, name), 'utf8')), name));
const fixture = parseAnatomyFile(JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/anatomy-fixture.json'), 'utf8')),
  'anatomy-fixture.json', { fixture: true });
const systems = systemsForView(baseSystems, true, fixture);

describe('lesson structure links stay within their system', () => {
  it('covers the current anatomy catalog', () => {
    expect(baseSystems.length).toBeGreaterThan(0);
    expect(systems.map((system) => system.key)).toEqual(expect.arrayContaining(['fixture', 'whole-body']));
  });

  it.each(systems.map((system) => [system.key, system.structures[0]!.id]))(
    '%s selects only after its own model is ready', (key, id) => {
      const focus = { system: key, structure: id };
      expect(linkedStructureId(focus, key, key, [id])).toBe(id);
      // A shared source ID in another system must never make a mismatched link succeed.
      expect(linkedStructureId(focus, 'another-system', 'another-system', [id])).toBeNull();
      // A render can switch systems before the previous ready state is replaced.
      expect(linkedStructureId(focus, key, 'previous-system', [id])).toBeNull();
      expect(linkedStructureId(focus, key, key, [])).toBeNull();
    },
  );

  it('does not apply an unavailable system link to the fallback model', () => {
    expect(linkedStructureId({ system: 'missing-system', structure: 'FIX001' }, 'fixture', 'fixture', ['FIX001'])).toBeNull();
  });

  it.each(['', '../x', 'Bad-System', 'a--b'])('rejects the whole target when an explicit system is invalid: %s', (system) => {
    const focus = focusFromSearch(`?system=${encodeURIComponent(system)}&structure=FIX001`);
    expect(focus).toEqual({ system: null, structure: null });
    expect(linkedStructureId(focus, 'fixture', 'fixture', ['FIX001'])).toBeNull();
  });

  it('allows structure-only links within the active loaded system', () => {
    expect(linkedStructureId({ system: null, structure: 'FIX001' }, 'fixture', 'fixture', ['FIX001'])).toBe('FIX001');
    expect(linkedStructureId({ system: 'fixture', structure: null }, 'fixture', 'fixture', ['FIX001'])).toBeNull();
  });
});
