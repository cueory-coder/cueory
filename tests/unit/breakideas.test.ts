import { describe, expect, it, vi } from 'vitest';
import {
  checkSharedIdea, ideasForLength, MAX_IDEA_CHARACTERS, parseIdeas, pickIdea, pickIdeaForLength, shuffleIdeasForLength, type BreakIdea,
} from '../../src/islands/breakideas';

const idea = (id = 'sample-one', text = 'sample wording') => ({ id, text });

describe('glove note idea checks', () => {
  it('exports the palm character limit and trims accepted text', () => {
    expect(MAX_IDEA_CHARACTERS).toBe(60);
    expect(checkSharedIdea('  sample wording  ')).toEqual({ ok: true, text: 'sample wording' });
  });

  it.each([0, 1, 60, 61])('checks the %i-character edge using Unicode code points', length => {
    expect(checkSharedIdea('a'.repeat(length)).ok).toBe(length >= 1 && length <= 60);
    expect(checkSharedIdea('😀'.repeat(length)).ok).toBe(length >= 1 && length <= 60);
  });

  it('preserves ordinary punctuation, case and joined emoji without judging wording', () => {
    expect(checkSharedIdea('Sample, then another sample! 👩‍⚕️')).toEqual({
      ok: true, text: 'Sample, then another sample! 👩‍⚕️',
    });
  });

  it.each(['👩🏽‍⚕️', '👨‍👩‍👧', '🏳️‍🌈'])('preserves supported joined emoji: %s', text => {
    expect(checkSharedIdea(text)).toEqual({ ok: true, text });
  });

  it.each(['\u200b', '\u2060', '\u00ad', '\u200c', '\u200d', '\u2061', '\uFE0F', '\u034f'])
    ('refuses invisible-only ideas and disguised addresses: %j', hidden => {
      for (const text of [hidden, `example.${hidden}com`]) {
        expect(checkSharedIdea(text)).toMatchObject({ ok: false });
        expect(() => parseIdeas({ ideas: [idea('sample-one', text)] })).toThrow(/break idea 1/);
      }
    });

  it('refuses joiners outside emoji even alongside visible words', () => {
    expect(checkSharedIdea('sample\u200d')).toMatchObject({ ok: false });
    expect(checkSharedIdea('a\u200db')).toMatchObject({ ok: false });
  });

  it.each(['example.भारत', 'example.संगठन'])('refuses a domain suffix containing combining marks: %s', text => {
    expect(checkSharedIdea(text)).toEqual({
      ok: false, message: 'leave out links, web addresses and email addresses.',
    });
    expect(() => parseIdeas({ ideas: [idea('sample-one', text)] })).toThrow(/break idea 1: leave out links/);
  });

  it.each(['👩🏽.com', '(👩🏽.com)', '[👩🏽.com]', '“👩🏽.com”', '%65xample%2ecom', '[2001:db8::1]',
    '[::ffff:192.0.2.1]', '0x7f000001'])('refuses browser-normalized web addresses: %s', text => {
    expect(checkSharedIdea(text)).toMatchObject({ ok: false });
    expect(() => parseIdeas({ ideas: [idea('sample-one', text)] })).toThrow(/break idea 1/);
  });

  it.each(['sample 1.5 minutes', 'sample 25', 'sample, then sample.', 'sample (another sample)'])
    ('keeps ordinary numbers and prose punctuation: %s', text => {
      expect(checkSharedIdea(text)).toEqual({ ok: true, text });
    });

  it.each([null, undefined, 4, [], {}, true, '   '])('refuses missing or non-text ideas: %j', value => {
    expect(checkSharedIdea(value)).toMatchObject({ ok: false, message: expect.any(String) });
  });

  it.each([
    'https://example.invalid', 'HTTP://EXAMPLE.INVALID', 'ftp://example.invalid',
    'mailto:sample@example.invalid', 'sample@example.invalid', 'www.example.invalid',
    'try example.invalid today', 'https://x', '//example.invalid', '192.0.2.1',
    'localhost:8080', '[sample](https://example.invalid)', '<https://example.invalid>',
    '例子.测试', 'ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ', 'example。invalid', 'data:text/html,sample',
    'sample.xn--p1ai', '☕.ws', '[sample](/breaks)', '<a href="/breaks">sample</a>',
  ])('refuses links and addresses in glove note text: %s', text => {
    expect(checkSharedIdea(text)).toEqual({
      ok: false, message: 'leave out links, web addresses and email addresses.',
    });
  });

  it.each([
    '\u0000', '\t', '\n', '\r', '\u007f', '\u0085', '\u061c', '\u200e', '\u200f',
    '\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069',
    '\u2028', '\u2029',
  ])('refuses control or bidirectional characters even before trimming: %j', control => {
    expect(checkSharedIdea(`${control}sample`)).toMatchObject({ ok: false });
    expect(checkSharedIdea(`sample${control}`)).toMatchObject({ ok: false });
  });
});

describe('glove note idea files', () => {
  it('parses a strict list, trims text and copies entries', () => {
    const input = { ideas: [idea('sample-one', '  sample wording  '), idea('sample-2')] };
    const result = parseIdeas(input);
    expect(result).toEqual([idea(), idea('sample-2')]);
    result[0]!.text = 'changed';
    expect(input.ideas[0]!.text).toBe('  sample wording  ');
    expect(parseIdeas({ ideas: [] })).toEqual([]);
  });

  it.each([null, [], {}, { ideas: null }, { ideas: {} }, { ideas: [], extra: true }])(
    'refuses the wrong file shape: %j', data => expect(() => parseIdeas(data)).toThrow(/ideas list/),
  );

  it.each([
    null, {}, { id: 'sample' }, { text: 'sample' }, { ...idea(), extra: true },
  ])('names a malformed entry by its position: %j', entry => {
    expect(() => parseIdeas({ ideas: [idea(), entry] })).toThrow(/break idea 2 needs an id, text and optional length only/);
  });

  it('refuses sparse entries and inherited fields', () => {
    expect(() => parseIdeas({ ideas: new Array(1) })).toThrow(/break idea 1/);
    expect(() => parseIdeas(Object.create({ ideas: [] }))).toThrow(/ideas list/);
    expect(() => parseIdeas({ ideas: [Object.create(idea())] })).toThrow(/break idea 1/);
  });

  it.each(['', 'Sample', 'sample one', '-sample', 'sample-', 'sample--one', 'a'.repeat(41)])(
    'refuses a non-slug or long id: %j', id => {
      expect(() => parseIdeas({ ideas: [idea(id)] })).toThrow(/break idea 1 needs a short lowercase id/);
    },
  );

  it('accepts the id length edge and refuses duplicate ids', () => {
    expect(parseIdeas({ ideas: [idea('a'.repeat(40))] })).toHaveLength(1);
    expect(() => parseIdeas({ ideas: [idea(), idea()] })).toThrow('break idea 2 repeats an earlier id.');
  });

  it.each(['', 'a'.repeat(61), 'example.invalid', 'sample\u202e', 5])(
    'applies share-text checks to each file entry: %j', text => {
      expect(() => parseIdeas({ ideas: [idea(), { id: 'sample-two', text }] })).toThrow(/break idea 2:/);
    },
  );
});

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('glove note idea selection', () => {
  const ideas = Object.freeze([idea('sample-one'), idea('sample-two'), idea('sample-three'), idea('sample-four')]
    .map(entry => Object.freeze(entry)));

  it('returns null for none and the sole idea even when it was last', () => {
    const random = vi.fn(() => 0.5);
    expect(pickIdea([], null, random)).toBeNull();
    expect(pickIdea([ideas[0]!], 'sample-one', random)).toEqual(ideas[0]);
    expect(random).not.toHaveBeenCalled();
  });

  it('makes reproducible shuffled choices without immediate repeats or mutating the input', () => {
    const sequence = (seed: number) => {
      const random = seededRandom(seed);
      const ids: string[] = [];
      for (let i = 0; i < 50; i++) {
        const selected = pickIdea(ideas, ids.at(-1), random)!;
        expect(selected.id).not.toBe(ids.at(-1));
        ids.push(selected.id);
      }
      return ids;
    };
    const result = sequence(43);
    expect(sequence(43)).toEqual(result);
    expect(sequence(44)).not.toEqual(result);
    expect(new Set(result)).toEqual(new Set(ideas.map(entry => entry.id)));
    expect(ideas.map(entry => entry.id)).toEqual(['sample-one', 'sample-two', 'sample-three', 'sample-four']);
  });

  it('handles two choices and an absent previous id, and returns a fresh entry', () => {
    expect(pickIdea(ideas.slice(0, 2), 'sample-one', () => 0)).toEqual(ideas[1]);
    expect(pickIdea(ideas, 'removed-id', () => 0)?.id).toBeTruthy();
    const selected = pickIdea(ideas, null, () => 0.5)!;
    selected.text = 'changed';
    expect(ideas.every(entry => entry.text === 'sample wording')).toBe(true);
  });

  it.each([NaN, Infinity, -0.1, 1])('refuses a broken random source: %s', draw => {
    expect(() => pickIdea(ideas, null, () => draw)).toThrow(/random must return/);
  });
});

describe('W19-2: length-aware break ideas', () => {
  const tagged = Object.freeze([
    Object.freeze({ id: 'sample-short', text: 'sample short', length: 'short' as const }),
    Object.freeze({ id: 'sample-long', text: 'sample long', length: 'long' as const }),
    Object.freeze({ id: 'sample-any', text: 'sample for either' }),
    Object.freeze({ id: 'sample-short-two', text: 'sample short two', length: 'short' as const }),
  ]);

  it('parses optional short/long tags and retains legacy untagged records', () => {
    expect(parseIdeas({ ideas: tagged })).toEqual(tagged);
    expect(parseIdeas({ ideas: [idea('legacy')] })).toEqual([idea('legacy')]);
  });

  it.each([null, '', 'any', 'medium', 10, false])('refuses an invalid length: %j', length => {
    expect(() => parseIdeas({ ideas: [{ ...idea('classified'), length }] }))
      .toThrow(/short or long length/);
  });

  it('keeps strict file schema and refuses repeat IDs', () => {
    expect(() => parseIdeas({ ideas: [{ ...tagged[0], extra: 'sample' }] })).toThrow(/optional length only/);
    expect(() => parseIdeas({ ideas: [tagged[0], tagged[0]] })).toThrow(/repeats an earlier id/);
  });

  it('selects eligible short, long and all ideas without mutating the input', () => {
    expect(ideasForLength(tagged, 'short').map(x => x.id))
      .toEqual(['sample-short', 'sample-any', 'sample-short-two']);
    expect(ideasForLength(tagged, 'long').map(x => x.id)).toEqual(['sample-long', 'sample-any']);
    expect(ideasForLength(tagged, 'any').map(x => x.id)).toEqual(tagged.map(x => x.id));
    expect(tagged).toHaveLength(4);
  });

  it('never immediately repeats an available idea, even across length changes', () => {
    const random = seededRandom(51);
    let previous: string | null = null;
    for (let n = 0; n < 20; n++) {
      const length = n % 2 === 0 ? 'short' : 'long';
      const next: BreakIdea = pickIdeaForLength(tagged, length, previous, random)!;
      expect(ideasForLength(tagged, length).map(x => x.id)).toContain(next.id);
      expect(next.id).not.toBe(previous);
      previous = next.id;
    }
  });

  it('is reproducible with a seeded source', () => {
    const picks = (seed: number) => {
      const random = seededRandom(seed);
      let last: string | null = null;
      return Array.from({ length: 20 }, () => {
        const next = pickIdeaForLength(tagged, 'short', last, random)!;
        last = next.id;
        return next.id;
      });
    };
    expect(picks(31)).toEqual(picks(31));
    expect(picks(31)).not.toEqual(picks(32));
  });

  it('lets unclassified samples fit either duration', () => {
    expect(pickIdeaForLength([tagged[0], tagged[1], tagged[2]], 'long', 'sample-long', () => 0))
      .toEqual(tagged[2]);
    expect(pickIdeaForLength([tagged[0], tagged[1], tagged[2]], 'short', 'sample-short', () => 0))
      .toEqual(tagged[2]);
  });

  it('returns the sole matching idea even when it was already shown', () => {
    const only = [tagged[0]];
    const random = vi.fn(() => 0.5);
    expect(pickIdeaForLength(only, 'short', only[0].id, random)).toEqual(only[0]);
    expect(random).not.toHaveBeenCalled();
  });

  it('returns null for an empty list or no eligible ideas', () => {
    const random = vi.fn(() => 0.5);
    expect(pickIdeaForLength([], 'any', null, random)).toBeNull();
    expect(pickIdeaForLength([tagged[0]], 'long', null, random)).toBeNull();
    expect(random).not.toHaveBeenCalled();
  });

  it('returns a fresh selection and never changes the source objects', () => {
    const picked = pickIdeaForLength(tagged, 'short', null, () => 0)!;
    picked.text = 'changed';
    expect(tagged.every(x => x.text.startsWith('sample'))).toBe(true);
  });
});

describe('W19-2: filtered shuffle changes visible cards', () => {
  const tagged = Object.freeze([
    Object.freeze({ id: 'sample-short-a', text: '[sample]', length: 'short' as const }),
    Object.freeze({ id: 'sample-long-a', text: '[sample]', length: 'long' as const }),
    Object.freeze({ id: 'sample-short-b', text: '[sample]', length: 'short' as const }),
    Object.freeze({ id: 'sample-long-b', text: '[sample]', length: 'long' as const }),
  ]);
  const ids = (ideas: readonly { id: string }[]) => ideas.map(idea => idea.id);

  it('reorders only visible short ideas even when the random draw otherwise keeps the same order', () => {
    const result = shuffleIdeasForLength(tagged, 'short', () => 0.999999);
    expect(ids(result)).toEqual(['sample-short-b', 'sample-long-a', 'sample-short-a', 'sample-long-b']);
    expect(ids(ideasForLength(result, 'short'))).not.toEqual(ids(ideasForLength(tagged, 'short')));
    expect(ids(tagged)).toEqual(['sample-short-a', 'sample-long-a', 'sample-short-b', 'sample-long-b']);
  });

  it('reorders only long ideas when the long filter is active', () => {
    expect(ids(shuffleIdeasForLength(tagged, 'long', () => 0.999999)))
      .toEqual(['sample-short-a', 'sample-long-b', 'sample-short-b', 'sample-long-a']);
  });

  it('reorders all ideas when no length filter is selected', () => {
    expect(ids(shuffleIdeasForLength(tagged, 'any', () => 0.999999)))
      .toEqual(['sample-long-a', 'sample-short-b', 'sample-long-b', 'sample-short-a']);
  });

  it('preserves every idea when fewer than two visible ideas are available', () => {
    const never = vi.fn(() => { throw new Error('should not draw'); });
    expect(shuffleIdeasForLength(tagged.slice(0, 2), 'short', never)).toEqual(tagged.slice(0, 2));
    expect(shuffleIdeasForLength([], 'short', never)).toEqual([]);
    expect(never).not.toHaveBeenCalled();
  });

  it('accepts untagged ideas in either filter without mutating the input', () => {
    const withUntagged = [...tagged, { id: 'sample-any', text: '[sample]' }];
    const result = shuffleIdeasForLength(withUntagged, 'long', () => 0.999999);
    expect(ids(ideasForLength(result, 'long'))).not.toEqual(ids(ideasForLength(withUntagged, 'long')));
    expect(ids(result).sort()).toEqual(ids(withUntagged).sort());
    expect(withUntagged.at(-1)?.id).toBe('sample-any');
  });

  it.each([NaN, Infinity, -0.1, 1])('rejects an invalid random draw: %s', value => {
    expect(() => shuffleIdeasForLength(tagged, 'any', () => value)).toThrow(/random must return/);
  });
});
