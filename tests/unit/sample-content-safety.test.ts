import { describe, expect, it } from 'vitest';
import { findProtectedFields } from '../../scripts/check-sample-content';

describe('sample content safety checker', () => {
  it('finds protected fields at any nesting level', () => {
    expect(findProtectedFields({ items: [{ metadata: { answerKey: ['sample-only'] } }] })).toEqual([
      '$.items[0].metadata.answerKey',
    ]);
  });

  it('allows ordinary sample fields', () => {
    expect(findProtectedFields({ status: 'sample', prompt: 'Example prompt', choices: ['one', 'two'] })).toEqual([]);
  });
});
