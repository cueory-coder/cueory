import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStoryFile, STORY_ASSET_TIMEOUT_MS, withTimeout } from '../../src/islands/share';

const never = <T,>() => new Promise<T>(() => undefined);

// Every token the story image reads, as plain sample numbers and names.
const tokens: Record<string, string> = {
  '--color-page': 'page', '--color-ink': 'ink', '--color-ink-soft': 'soft',
  '--font-body': 'body', '--font-display': 'display',
};
for (const name of ['width', 'height', 'logo-width', 'logo-top', 'label-y', 'result-y', 'challenge-y', 'site-y',
  'label-size', 'result-size', 'challenge-size', 'site-size', 'dark-logo']) tokens[`--share-story-${name}`] = '1';

function stubPage(
  fontsReady: Promise<unknown>,
  toBlob: (done: (blob: Blob | null) => void) => void = (done) => done(new Blob(['[sample]'])),
) {
  const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() };
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => tokens[name] ?? '' }));
  vi.stubGlobal('document', {
    documentElement: {},
    fonts: { ready: fontsReady },
    createElement: () => ({ getContext: () => context, toBlob }),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('story image never hangs the share flow', () => {
  it('returns null after the timeout when fonts never finish loading', async () => {
    vi.useFakeTimers();
    stubPage(never());
    const image = vi.fn();
    vi.stubGlobal('Image', image);
    let settled: File | null | undefined;
    void createStoryFile({ name: 'pillo', date: 'nov 11', result: '[sample result]' }).then((file) => { settled = file; });
    await vi.advanceTimersByTimeAsync(STORY_ASSET_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
    expect(image).not.toHaveBeenCalled();
  });

  it('returns null after the timeout when the logo image never loads or fails', async () => {
    vi.useFakeTimers();
    stubPage(Promise.resolve());
    // An image whose load and error events never fire.
    vi.stubGlobal('Image', class { onload: unknown = null; onerror: unknown = null; src = ''; });
    let settled: File | null | undefined;
    void createStoryFile({ name: 'pillo', date: 'nov 11', result: '[sample result]' }).then((file) => { settled = file; });
    await vi.advanceTimersByTimeAsync(STORY_ASSET_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
  });

  it('returns null after the total timeout when canvas toBlob never calls back', async () => {
    vi.useFakeTimers();
    stubPage(Promise.resolve(), () => undefined);
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1;
      height = 1;
      set src(_value: string) { this.onload?.(); }
    });
    let settled: File | null | undefined;
    void createStoryFile({ name: 'pillo', date: 'nov 11', result: '[sample result]' }).then((file) => { settled = file; });
    await vi.advanceTimersByTimeAsync(STORY_ASSET_TIMEOUT_MS);
    expect(settled).toBeNull();
  });

  it('uses one total budget across fonts, logo and wordmark', async () => {
    vi.useFakeTimers();
    const delayedFonts = new Promise<void>((resolve) => setTimeout(resolve, 1500));
    stubPage(delayedFonts);
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1;
      height = 1;
      set src(_value: string) { setTimeout(() => this.onload?.(), 1500); }
    });
    let settled: File | null | undefined;
    void createStoryFile({
      name: 'pillo',
      date: 'nov 11',
      result: '[sample result]',
      wordmarkPath: '/brand/v1/pillo-wordmark.png',
    }).then((file) => { settled = file; });
    await vi.advanceTimersByTimeAsync(STORY_ASSET_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
  });

  it('clears the total timer after a successful render and an immediate image failure', async () => {
    vi.useFakeTimers();
    stubPage(Promise.resolve());
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1;
      height = 1;
      set src(_value: string) { this.onload?.(); }
    });
    await expect(createStoryFile({ name: 'pillo', date: 'nov 11', result: '[sample result]' })).resolves.toBeInstanceOf(File);
    expect(vi.getTimerCount()).toBe(0);

    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { this.onerror?.(); }
    });
    await expect(createStoryFile({ name: 'pillo', date: 'nov 11', result: '[sample result]' })).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a value that arrives in time and clears its timer', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve('ready'), STORY_ASSET_TIMEOUT_MS)).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits about four seconds at most', () => {
    expect(STORY_ASSET_TIMEOUT_MS).toBe(4000);
  });
});
