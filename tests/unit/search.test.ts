import { describe, expect, it, vi } from 'vitest';
import { cleanUrl, createSearchLoader, excerptParts, keepFocus, MAX_RESULTS, moveFocus, statusText } from '../../src/scripts/search';

describe('site search loading', () => {
  it('loads only on demand, shares concurrent requests, and keeps a successful result', async () => {
    const search = { ready: true };
    let resolve!: (value: typeof search) => void;
    const initialize = vi.fn(() => new Promise<typeof search>((done) => { resolve = done; }));
    const load = createSearchLoader(initialize);
    expect(initialize).not.toHaveBeenCalled();

    const first = load();
    const concurrent = load();
    expect(concurrent).toBe(first);
    await Promise.resolve();
    expect(initialize).toHaveBeenCalledTimes(1);
    resolve(search);
    await expect(first).resolves.toBe(search);
    await expect(concurrent).resolves.toBe(search);
    expect(load()).toBe(first);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('lets the next search retry after a shared module download fails', async () => {
    const failure = new TypeError('search module download failed');
    const search = { ready: true };
    const initialize = vi.fn<() => Promise<typeof search>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(search);
    const load = createSearchLoader(initialize);
    const first = load();
    expect(load()).toBe(first);
    await expect(first).rejects.toBe(failure);
    expect(initialize).toHaveBeenCalledTimes(1);

    const retry = load();
    expect(retry).not.toBe(first);
    await expect(retry).resolves.toBe(search);
    expect(load()).toBe(retry);
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('does not retry a continuing failure until another load is requested', async () => {
    const initialize = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('offline'));
    const load = createSearchLoader(initialize);
    await expect(load()).rejects.toThrow('offline');
    await Promise.resolve();
    expect(initialize).toHaveBeenCalledTimes(1);
    await expect(load()).rejects.toThrow('offline');
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('also releases a failed initializer that throws before returning a promise', async () => {
    const initialize = vi.fn<() => Promise<string>>()
      .mockImplementationOnce(() => { throw new Error('initialization failed'); })
      .mockResolvedValue('ready');
    const load = createSearchLoader(initialize);
    await expect(load()).rejects.toThrow('initialization failed');
    await expect(load()).resolves.toBe('ready');
    expect(initialize).toHaveBeenCalledTimes(2);
  });
});

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

  it('keeps keyboard focus on a result, or on the field, when new results replace the list', () => {
    expect(keepFocus(2, 5)).toBe(2);
    expect(keepFocus(4, 2)).toBe(1);
    expect(keepFocus(0, 1)).toBe(0);
    expect(keepFocus(3, 0)).toBe(-1);
  });
});
