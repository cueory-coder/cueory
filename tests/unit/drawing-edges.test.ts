import { describe, expect, it } from 'vitest';
import { captionFrom, describedParts, playerSteps, wrapLines } from '../../src/visuals/drawing';

describe('drawing helper boundary and refusal cases', () => {
  const visual = { id: 'sample', labels: [], depictions: [] };

  it('handles drawings without captions, depictions or player steps', () => {
    expect(captionFrom(visual, [])).toBe('');
    expect(describedParts(visual, [])).toEqual([]);
    expect(playerSteps(visual, [])).toEqual([]);
  });

  it('refuses a step that depicts something absent from the source', () => {
    expect(() => describedParts(visual, [{ id: 'one', caption: [], depictions: ['missing'] }]))
      .toThrow(/missing/);
  });

  it('refuses a caption that quotes an unknown source label', () => {
    expect(() => captionFrom(visual, [['missing']])).toThrow();
  });

  it('keeps repeated depiction references once, in first-use order', () => {
    const source = { id: 'sample', depictions: [{ id: 'a', what: 'first', source: 'sample' }, { id: 'b', what: 'second', source: 'sample' }] };
    const steps = [{ id: 'one', caption: [], depictions: ['b', 'a', 'b'] }];
    expect(describedParts(source, steps)).toEqual(['second', 'first']);
    expect(steps[0]?.depictions).toEqual(['b', 'a', 'b']);
  });

  it('wraps empty text and an exact-width word without extra lines', () => {
    expect(wrapLines('', 5)).toEqual([]);
    expect(wrapLines('hello world', 5)).toEqual(['hello', 'world']);
  });
});
