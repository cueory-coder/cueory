import { describe, expect, it } from 'vitest';
import { cleanUrl, excerptParts, MAX_RESULTS, moveFocus, statusText } from '../../src/scripts/search';

describe('site search helpers (D-49)', () => {
  it('links results to the addresses visitors type, without .html', () => {
    expect(cleanUrl('/privacy.html')).toBe('/privacy');
    expect(cleanUrl('/index.html')).toBe('/');
    expect(cleanUrl('/')).toBe('/');
    expect(cleanUrl('/learn/study-skills.html')).toBe('/learn/study-skills');
    expect(cleanUrl('/learn/study-skills/index.html')).toBe('/learn/study-skills');
    expect(cleanUrl('/learn/study-skills/cards.html')).toBe('/learn/study-skills/cards');
    expect(cleanUrl('/learn/study-skills/')).toBe('/learn/study-skills');
    expect(cleanUrl('/privacy.html#what-we-store')).toBe('/privacy#what-we-store');
    expect(cleanUrl('/index.html#ways-to-study')).toBe('/#ways-to-study');
  });

  it('says how many results there are, in words', () => {
    expect(statusText('', 0, 0)).toBe('');
    expect(statusText('   ', 0, 0)).toBe('');
    expect(statusText('zzq', 0, 0)).toBe('no results for “zzq”');
    expect(statusText(' zzq ', 0, 0)).toBe('no results for “zzq”');
    expect(statusText('privacy', 1, 1)).toBe('1 result');
    expect(statusText('card', 3, 3)).toBe('3 results');
    expect(statusText('the', 23, MAX_RESULTS)).toBe(`${MAX_RESULTS} of 23 results`);
  });

  it('turns an excerpt into plain text pieces, with the matched words marked', () => {
    expect(excerptParts('Flip through the <mark>cards</mark> one by one.')).toEqual([
      { text: 'Flip through the ', mark: false },
      { text: 'cards', mark: true },
      { text: ' one by one.', mark: false },
    ]);
    expect(excerptParts('<mark>Card</mark> <mark>2</mark>')).toEqual([
      { text: 'Card', mark: true },
      { text: ' ', mark: false },
      { text: '2', mark: true },
    ]);
    expect(excerptParts('')).toEqual([]);
  });

  it('decodes entities, and keeps any other tag as text instead of HTML', () => {
    expect(excerptParts('Salt &amp; water &lt;b&gt; &quot;hi&quot; &#39;x&#39; &#x2014; &nbsp;')).toEqual([
      { text: 'Salt & water <b> "hi" \'x\' —  ', mark: false },
    ]);
    expect(excerptParts('<script>alert(1)</script> <mark>ok</mark>')).toEqual([
      { text: '<script>alert(1)</script> ', mark: false },
      { text: 'ok', mark: true },
    ]);
    // Unknown or broken entities stay as written.
    expect(excerptParts('&bogus; &#0; &#xzz;')).toEqual([{ text: '&bogus; &#0; &#xzz;', mark: false }]);
  });

  it('moves between the field and the results with the arrow keys', () => {
    // -1 is the search field.
    expect(moveFocus(-1, 3, 'ArrowDown')).toBe(0);
    expect(moveFocus(0, 3, 'ArrowDown')).toBe(1);
    expect(moveFocus(2, 3, 'ArrowDown')).toBe(2);
    expect(moveFocus(2, 3, 'ArrowUp')).toBe(1);
    expect(moveFocus(0, 3, 'ArrowUp')).toBe(-1);
    expect(moveFocus(-1, 3, 'ArrowUp')).toBeUndefined();
    expect(moveFocus(-1, 0, 'ArrowDown')).toBeUndefined();
    expect(moveFocus(1, 3, 'Enter')).toBeUndefined();
    expect(moveFocus(1, 3, 'Tab')).toBeUndefined();
  });
});
