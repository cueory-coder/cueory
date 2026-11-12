/** W07-2: readable offline states, including partial saves, quota errors and failed cleanup. */
import { describe, expect, it } from 'vitest';
import {
  startOffline, firstVisitUrls, offlineStartState, offlineProgressState, offlineStorageFull,
  offlineFailureState, offlineOffState, offlineStateText, renderOfflineState,
  type OfflineState, type OfflineEnvironment, type WorkerContainer,
} from '../../src/scripts/offline';
import { cacheName } from '../../src/scripts/offlineplan';

const ORIGIN = 'https://cueory.app';
const PAGE = ORIGIN + '/learn/study-skills';

function setup(options: {
  enabled?: boolean;
  secure?: boolean;
  supported?: boolean;
  controlled?: boolean;
  registerError?: unknown;
  clearError?: boolean;
  unregisterError?: boolean;
  unregisterReturnsFalse?: boolean;
  estimate?: { usage?: number; quota?: number };
  ready?: Promise<unknown>;
  wait?: (milliseconds: number) => Promise<void>;
  fetchOne?: (url: string) => Promise<unknown>;
  resources?: string[];
} = {}) {
  const statuses: OfflineState[] = [];
  const order: string[] = [];
  const calls: string[] = [];
  const names = new Set([cacheName('older'), 'unrelated-cache']);
  let controller: unknown = options.controlled ? {} : undefined;
  let onChange: (() => void) | undefined;
  const container: WorkerContainer = {
    get controller() { return controller; },
    ready: options.ready ?? Promise.resolve({}),
    register: async (url, opts) => {
      calls.push('register:' + url + ':' + opts.scope);
      if (options.registerError) throw options.registerError;
      if (!options.controlled) controller = {};
      return {};
    },
    getRegistrations: async () => [{
      unregister: async () => {
        order.push('unregister');
        if (options.unregisterError) throw new Error('unregister blocked');
        return !options.unregisterReturnsFalse;
      },
    }],
    addEventListener: (_type, fn) => { onChange = fn; },
  };
  const env: OfflineEnvironment = {
    serviceWorker: options.supported === false ? undefined : container,
    secure: options.secure ?? true,
    enabled: options.enabled ?? true,
    origin: ORIGIN,
    pageUrl: PAGE,
    resources: () => options.resources ?? ['/_astro/app.abc123.js'],
    fetchOne: async (url) => {
      calls.push('fetch:' + url);
      return options.fetchOne?.(url);
    },
    clearCopies: async () => {
      order.push('clear');
      if (options.clearError) throw new Error('cache blocked');
      for (const name of [...names]) if (name.startsWith(cacheName('x').slice(0, -1))) names.delete(name);
    },
    wait: options.wait ?? (async () => undefined),
    storageEstimate: async () => options.estimate,
    onState: (state) => { statuses.push(state); },
  };
  return {
    env, calls, order, names, statuses,
    changeController: () => { controller = {}; onChange?.(); },
  };
}

describe('offline switch decisions', () => {
  it('separates disabled, unsupported and saving states', () => {
    expect(offlineStartState(false, true, true)).toBe('turning-off');
    expect(offlineStartState(false, true, false)).toBe('off');
    expect(offlineStartState(false, false, true)).toBe('off');
    expect(offlineStartState(true, false, true)).toBe('not-supported');
    expect(offlineStartState(true, true, false)).toBe('not-supported');
    expect(offlineStartState(true, true, true)).toBe('saving');
  });

  it('never calls a partial or failed save ready', () => {
    expect(offlineProgressState(0, 2, false)).toBe('saving');
    expect(offlineProgressState(1, 2, false)).toBe('saving');
    expect(offlineProgressState(2, 2, false)).toBe('ready');
    expect(offlineProgressState(2, 2, true)).toBe('unavailable');
    expect(offlineProgressState(-1, 2, false)).toBe('unavailable');
    expect(offlineProgressState(3, 2, false)).toBe('unavailable');
    expect(offlineProgressState(0, 0, false)).toBe('ready');
  });

  it('recognizes full storage only with reliable positive quota values', () => {
    expect(offlineStorageFull({ usage: 100, quota: 100 })).toBe(true);
    expect(offlineStorageFull({ usage: 101, quota: 100 })).toBe(true);
    expect(offlineStorageFull({ usage: 99, quota: 100 })).toBe(false);
    expect(offlineStorageFull({ usage: 0, quota: 0 })).toBe(false);
    expect(offlineStorageFull({ usage: NaN, quota: 100 })).toBe(false);
    expect(offlineStorageFull(undefined)).toBe(false);
    expect(offlineStorageFull({ quota: 100 })).toBe(false);
  });

  it('distinguishes quota errors from network errors and cleanup failures', () => {
    expect(offlineFailureState({ name: 'QuotaExceededError' })).toBe('storage-full');
    expect(offlineFailureState({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe('storage-full');
    expect(offlineFailureState(new Error('network'))).toBe('unavailable');
    expect(offlineFailureState({ name: 'NotAllowedError' })).toBe('unavailable');
    expect(offlineFailureState(undefined, { usage: 100, quota: 100 })).toBe('storage-full');
    expect(offlineOffState(true)).toBe('off');
    expect(offlineOffState(false)).toBe('unavailable');
  });

  it('uses distinct accessible text for every possible state', () => {
    const states: OfflineState[] = ['off', 'turning-off', 'not-supported', 'saving', 'ready', 'storage-full', 'unavailable'];
    expect(new Set(states.map(offlineStateText)).size).toBe(states.length);
    for (const state of states) expect(offlineStateText(state).length).toBeGreaterThan(20);
  });
});

describe('worker registration, save and cleanup fakes', () => {
  it('removes site caches first, then unregisters, without touching other caches', async () => {
    const x = setup({ enabled: false });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['turning-off', 'off']);
    expect(x.order).toEqual(['clear', 'unregister']);
    expect([...x.names]).toEqual(['unrelated-cache']);
    expect(x.calls).toEqual([]);
  });

  it.each([
    [{ clearError: true }],
    [{ unregisterError: true }],
    [{ unregisterReturnsFalse: true }],
  ])('does not falsely announce off after incomplete cleanup %j', async (opts) => {
    const x = setup({ enabled: false, ...opts });
    await startOffline(x.env);
    expect(x.order).toEqual(['clear', 'unregister']);
    expect(x.statuses).toEqual(['turning-off', 'unavailable']);
  });

  it.each([['unsupported browser', { supported: false }], ['insecure context', { secure: false }]] as const)
    ('does not register when %s', async (_label, opts) => {
      const x = setup(opts);
      await startOffline(x.env);
      expect(x.statuses).toEqual(['not-supported']);
      expect(x.calls).toEqual([]);
    });

  it('saves both public resources and reports readiness only after saving', async () => {
    const x = setup();
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'ready']);
    expect(x.calls).toEqual([
      'register:/sw.js:/', 'fetch:' + PAGE, 'fetch:' + ORIGIN + '/_astro/app.abc123.js',
    ]);
  });

  it('a failed middle request never reports ready and does not skip later resources', async () => {
    const x = setup({
      resources: ['/_astro/a.js', '/_astro/b.css'],
      fetchOne: async url => { if (url.endsWith('/a.js')) throw new Error('network'); },
    });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'unavailable']);
    expect(x.calls.filter(call => call.startsWith('fetch:'))).toEqual([
      'fetch:' + PAGE, 'fetch:' + ORIGIN + '/_astro/a.js', 'fetch:' + ORIGIN + '/_astro/b.css',
    ]);
  });

  it.each([
    ['HTTP failure', { ok: false, status: 503 }],
    ['private', { ok: true, status: 200, type: 'basic', redirected: false,
      headers: { get: () => 'private' } }],
    ['redirect', { ok: true, status: 200, type: 'basic', redirected: true,
      headers: { get: () => null } }],
    ['partial', { ok: true, status: 206, type: 'basic', redirected: false,
      headers: { get: () => null } }],
    ['opaque', { ok: true, status: 200, type: 'opaque', redirected: false,
      headers: { get: () => null } }],
  ])('does not claim ready for %s', async (_name, response) => {
    const x = setup({ fetchOne: async () => response });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'unavailable']);
  });

  it('reports storage full without making fetch requests when quota is exhausted', async () => {
    const x = setup({ estimate: { usage: 100, quota: 100 } });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'storage-full']);
    expect(x.calls.filter(call => call.startsWith('fetch:'))).toEqual([]);
  });

  it('stops after a mid-save quota error instead of reporting ready', async () => {
    const x = setup({
      resources: ['/_astro/a.js', '/_astro/b.css'],
      fetchOne: async url => { if (url.endsWith('/a.js')) throw { name: 'QuotaExceededError' }; },
    });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'storage-full']);
    expect(x.calls.filter(call => call.startsWith('fetch:'))).toEqual([
      'fetch:' + PAGE, 'fetch:' + ORIGIN + '/_astro/a.js',
    ]);
  });

  it('never briefly claims ready before a final quota check', async () => {
    const x = setup();
    let estimates = 0;
    x.env.storageEstimate = async () => ++estimates === 1
      ? { usage: 1, quota: 100 }
      : { usage: 100, quota: 100 };
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'storage-full']);
  });

  it('handles registration rejection and pending worker readiness without a half-on state', async () => {
    const rejected = setup({ registerError: new Error('denied') });
    await startOffline(rejected.env);
    expect(rejected.statuses).toEqual(['saving', 'unavailable']);
    const pending = setup({ ready: new Promise(() => undefined), wait: async () => undefined });
    await startOffline(pending.env);
    expect(pending.statuses).toEqual(['saving', 'unavailable']);
  });

  it('handles later worker activation and refreshes the saved visit', async () => {
    const x = setup({ controlled: true });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'ready']);
    x.changeController();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(x.statuses).toEqual(['saving', 'ready', 'saving', 'ready']);
    expect(x.calls.some(call => call === 'fetch:' + PAGE)).toBe(true);
  });

  it('keeps private and preview URLs out of the save plan', () => {
    expect(firstVisitUrls('/learn/study-skills', [
      '/admin', '/progress', '/account/settings', '/auth/callback?code=sample', '/preview/share', '/_astro/app.js',
    ], ORIGIN)).toEqual([PAGE, ORIGIN + '/_astro/app.js']);
  });
});

describe('offline screen-reader status', () => {
  it('creates one polite text live region and updates the same region', () => {
    const attributes = new Map<string, string>();
    const status = {
      className: '',
      dataset: {} as Record<string, string>,
      textContent: '',
      setAttribute(name: string, value: string) { attributes.set(name, value); },
    };
    let count = 0;
    const footer = {
      querySelector: (_selector: string) => count ? status : null,
      append: (_node: unknown) => { count += 1; },
    };
    const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => footer, createElement: () => status },
    });
    try {
      renderOfflineState('saving');
      expect(count).toBe(1);
      expect(attributes.get('role')).toBe('status');
      expect(attributes.get('aria-live')).toBe('polite');
      expect(attributes.get('aria-atomic')).toBe('true');
      expect(status.dataset.offlineStatus).toBe('saving');
      expect(status.textContent).toBe(offlineStateText('saving'));
      renderOfflineState('ready');
      expect(count).toBe(1);
      expect(status.dataset.offlineStatus).toBe('ready');
      expect(status.textContent).toBe(offlineStateText('ready'));
    } finally {
      if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });
});
