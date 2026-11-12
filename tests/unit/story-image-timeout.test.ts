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

function stubPage(fontsReady: Promise<unknown>) {
  const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() };
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (name: string) => tokens[name] ?? '' }));
  vi.stubGlobal('document', {
    documentElement: {},
    fonts: { ready: fontsReady },
    createElement: () => ({ getContext: () => context, toBlob: (done: (blob: Blob) => void) => done(new Blob(['[sample]'])) }),
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

  it('keeps a value that arrives in time and clears its timer', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve('ready'), STORY_ASSET_TIMEOUT_MS)).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits about four seconds at most', () => {
    expect(STORY_ASSET_TIMEOUT_MS).toBe(4000);
  });
});
