import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv, validateCurriculum } from '../../scripts/check-curriculum.mjs';


/** Minimal temporary curriculum data, using only the columns consumed by the validator. */
function validatePilotRows(rows: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'cueory-curriculum-'));
  try {
    const folder = join(root, 'content', 'curriculum');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'blocks-v4.csv'), 'block_id\nM02-L01\n');
    writeFileSync(join(folder, 'objectives-pilot-v4.csv'),
      ['objective_id,block_id,required_before', ...rows].join('\n') + '\n');
    return validateCurriculum(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('curriculum validation', () => {
  it('parses csv text with quoted cells and commas', () => {
    const raw = `a,b,"c, d"\n1,2,"quoted ""value"""`;
    const rows = parseCsv(raw);
    expect(rows).toEqual([
      ['a', 'b', 'c, d'],
      ['1', '2', 'quoted "value"'],
    ]);
  });

  it('validates draft-4 curriculum files', () => {
    const result = validateCurriculum();
    expect(result.blocksCount).toBeGreaterThanOrEqual(200);
    expect(result.objectivesCount).toBeGreaterThanOrEqual(10);
  });
  it('detects a prerequisite cycle through the cumulative all-of-the-above shorthand', () => {
    // O01 depends on O02, while O02 depends on every earlier objective, including O01.
    expect(() => validatePilotRows([
      'M02-L01-O01,M02-L01,M02-L01-O02',
      'M02-L01-O02,M02-L01,all of the above',
    ])).toThrow(/Cycle detected in curriculum prerequisites/);
  });

  it('accepts a genuine cumulative objective after its earlier prerequisites', () => {
    expect(validatePilotRows([
      'M02-L01-O01,M02-L01,',
      'M02-L01-O02,M02-L01,M02-L01-O01',
      'M02-L01-O03,M02-L01,all of the above',
    ])).toEqual({ blocksCount: 1, objectivesCount: 3 });
  });

  it('refuses cumulative shorthand when nothing precedes the objective', () => {
    expect(() => validatePilotRows([
      'M02-L01-O01,M02-L01,all of the above',
    ])).toThrow(/without any preceding objectives/);
  });

});
