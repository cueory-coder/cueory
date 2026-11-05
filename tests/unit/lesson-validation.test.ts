import { describe, expect, it } from 'vitest';
import { lessonSentenceProblems } from '../../src/content/lesson-validation';

describe('lesson sentence validation', () => {
  it('accepts distinct sentences with meaningful text', () => {
    expect(lessonSentenceProblems([
      { id: 'one', text: 'First idea.' },
      { id: 'two', text: 'Second idea.' },
    ])).toEqual([]);
  });

  it('rejects duplicate ids and whitespace-only text', () => {
    expect(lessonSentenceProblems([
      { id: 'same', text: 'First idea.' },
      { id: 'same', text: '   ' },
    ])).toEqual([
      'sentence 2 repeats id "same"',
      'sentence 2 has no meaningful text',
    ]);
  });
});
