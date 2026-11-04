import { afterEach, describe, expect, it } from 'vitest';
import { browserStorage, type KeyValueStorage } from '../../src/scripts/storage';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete (globalThis as { window?: unknown }).window;
});

function setWindow(localStorage: KeyValueStorage): void {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });
}

describe('browserStorage', () => {
  it('returns the browser local storage when it is available', () => {
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    setWindow(storage);

    expect(browserStorage()).toBe(storage);
  });

  it('returns no storage when the browser does not expose a window', () => {
    expect(browserStorage()).toBeUndefined();
  });

  it('returns no storage when accessing local storage throws', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        get localStorage(): never {
          throw new Error('storage blocked');
        },
      },
    });

    expect(browserStorage()).toBeUndefined();
  });
});
