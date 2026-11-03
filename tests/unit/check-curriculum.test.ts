import { describe, expect, it } from 'vitest';
import { parseCsv, validateCurriculum } from '../../scripts/check-curriculum.mjs';

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
});
