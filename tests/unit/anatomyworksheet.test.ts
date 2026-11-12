import { describe, expect, it } from 'vitest';
import {
  BODYPARTS3D_CREDIT,
  BODYPARTS3D_LICENSE_URL,
  BODYPARTS3D_REFERENCE_NOTE,
  BODYPARTS3D_REFERENCE_URL,
  FIXTURE_CREDIT,
  MAX_LABELS,
  type AnatomySystem,
} from '../../src/islands/anatomylab';
import {
  WORKSHEET_MAX,
  worksheetBlockReason,
  worksheetCreditLines,
  worksheetFileName,
  worksheetLabels,
  worksheetLeftOutNote,
  worksheetOrder,
  worksheetRows,
} from '../../src/islands/anatomyworksheet';

const model = { release: '[sample release]' } as AnatomySystem['model'];

describe('anatomy worksheet: when one can be made', () => {
  it('numbers as many structures as the 3D view can label', () => {
    expect(WORKSHEET_MAX).toBe(MAX_LABELS);
  });

  it('needs at least one structure and at most the limit', () => {
    expect(worksheetBlockReason(0)).toMatch(/at least one structure/);
    expect(worksheetBlockReason(1)).toBeNull();
    expect(worksheetBlockReason(WORKSHEET_MAX)).toBeNull();
    const tooMany = worksheetBlockReason(WORKSHEET_MAX + 1)!;
    expect(tooMany).toContain(`up to ${WORKSHEET_MAX} structures`);
    expect(tooMany).toContain(`${WORKSHEET_MAX + 1} are showing`);
  });
});

describe('anatomy worksheet: numbering', () => {
  it('numbers top to bottom, then left to right within a row', () => {
    const points = [
      { id: 'low', x: 10, y: 300 },
      { id: 'top-right', x: 200, y: 20 },
      { id: 'top-left', x: 10, y: 26 },
      { id: 'middle', x: 90, y: 150 },
    ];
    expect(worksheetOrder(['low', 'top-right', 'top-left', 'middle'], points)).toEqual(['top-left', 'top-right', 'middle', 'low']);
  });

  it('puts structures the camera cannot place last, in their given order, and never repeats one', () => {
    const order = worksheetOrder(['b', 'hidden-2', 'a', 'hidden-1', 'a'], [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 50 }]);
    expect(order).toEqual(['a', 'b', 'hidden-2', 'hidden-1']);
  });

  it('breaks an exact tie by id so the numbering is the same every time', () => {
    const points = [{ id: 'b', x: 5, y: 5 }, { id: 'a', x: 5, y: 5 }];
    expect(worksheetOrder(['b', 'a'], points)).toEqual(['a', 'b']);
  });

  it('draws numbers on the picture, never names', () => {
    expect(worksheetLabels(['x', 'y', 'z'])).toEqual([
      { id: 'x', text: '1' },
      { id: 'y', text: '2' },
      { id: 'z', text: '3' },
    ]);
  });
});

describe('anatomy worksheet: the list', () => {
  const names = new Map([['x', '[sample label] x'], ['y', '[sample label] y']]);

  it('keeps each number with its structure and falls back to the id without a name', () => {
    expect(worksheetRows(['x', 'y', 'z'], [], names)).toEqual([
      { number: 1, id: 'x', name: '[sample label] x' },
      { number: 2, id: 'y', name: '[sample label] y' },
      { number: 3, id: 'z', name: 'z' },
    ]);
  });

  it('leaves out a number the picture has no room for, and says which', () => {
    expect(worksheetRows(['x', 'y', 'z'], ['y'], names).map((row) => row.number)).toEqual([1, 3]);
    expect(worksheetLeftOutNote(['x', 'y', 'z'], ['y', 'z'])).toContain('number 2, 3');
    expect(worksheetLeftOutNote(['x', 'y', 'z'], [])).toBe('');
  });
});

describe('anatomy worksheet: credit and file name', () => {
  it('prints the BodyParts3D credit word for word, with the license and scope written out', () => {
    const lines = worksheetCreditLines({ status: 'draft', model, fixture: false });
    expect(lines[0]).toBe(BODYPARTS3D_CREDIT);
    expect(lines[0]).toContain('BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International');
    expect(lines).toContain(`license: ${BODYPARTS3D_LICENSE_URL}`);
    expect(lines).toContain(`${BODYPARTS3D_REFERENCE_NOTE}: ${BODYPARTS3D_REFERENCE_URL}`);
  });

  it('says a draft model is a draft', () => {
    expect(worksheetCreditLines({ status: 'draft', model, fixture: false })).toContain('draft model, built from [sample release]');
    expect(worksheetCreditLines({ status: 'approved', model, fixture: false })).toContain('model release: [sample release]');
  });

  it('never credits BodyParts3D for the test shapes', () => {
    const lines = worksheetCreditLines({ status: 'draft', model, fixture: true });
    expect(lines[0]).toBe(FIXTURE_CREDIT);
    expect(lines.join(' ')).not.toContain('Database Center');
  });

  it('makes a safe file name from any system key', () => {
    expect(worksheetFileName('skeleton-axial')).toBe('cueory-skeleton-axial-worksheet.png');
    expect(worksheetFileName('../../Etc Passwd')).toBe('cueory-etc-passwd-worksheet.png');
    expect(worksheetFileName('')).toBe('cueory-anatomy-worksheet.png');
    expect(worksheetFileName('x'.repeat(200)).length).toBeLessThanOrEqual('cueory--worksheet.png'.length + 60);
  });
});
