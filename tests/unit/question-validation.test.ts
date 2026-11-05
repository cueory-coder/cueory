import { describe, expect, it } from 'vitest';
import { questionContentProblems } from '../../src/content/question-validation';

describe('sample question content validation', () => {
  it('accepts feedback for every choice', () => {
    expect(questionContentProblems([{
      id: 'sample',
      choices: [{ id: 'a' }, { id: 'b' }],
      rationales: { a: 'because a', b: 'because b' },
    }])).toEqual([]);
  });

  it('rejects missing and blank rationales', () => {
    expect(questionContentProblems([{
      id: 'sample',
      choices: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      rationales: { a: 'because a', b: '  ' },
    }])).toEqual([
      'question "sample" is missing a rationale for choice b',
      'question "sample" is missing a rationale for choice c',
    ]);
  });
});
