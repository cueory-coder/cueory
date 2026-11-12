/** W07-2: readable offline states, including partial saves, quota errors and failed cleanup. */
import { describe, expect, it } from 'vitest';
import {
  startOffline, firstVisitUrls, offlineStartState, offlineProgressState, offlineStorageFull, offlineFetchSaved, offlineCopiesPresent,
  offlineFailureState, offlineOffState, offlineStateText, renderOfflineState,
  type OfflineState, type OfflineEnvironment, type WorkerContainer,
} from '../../src/scripts/offline';
import { cacheName } from '../../src/scripts/offlineplan';
import { buildServiceWorker } from '../../src/scripts/swbuild';
import { readFileSync } from 'node:fs';
import * as vm from 'node:vm';

const ORIGIN = 'https://cueory.app';
const PAGE = ORIGIN + '/learn/study-skills';
const storableResponse = () => ({
  ok: true, status: 200, type: 'basic', redirected: false,
  headers: { get: (_name: string) => null },
});

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
  writeResult?: 'ok' | 'fail' | 'delayed';
  initiallyStored?: boolean;
} = {}) {
  const statuses: OfflineState[] = [];
  const order: string[] = [];
  const calls: string[] = [];
  const activeName = cacheName('active');
  const names = new Set([activeName, 'unrelated-cache']);
  const saved = new Set<string>(options.initiallyStored ? [PAGE, ORIGIN + '/_astro/app.abc123.js'] : []);
  const delayed: string[] = [];
  let releaseWriteWait: () => void = () => undefined;
  const released = new Promise<void>((resolve) => { releaseWriteWait = resolve; });
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
      const answer = await (options.fetchOne ? options.fetchOne(url) : storableResponse());
      // This fake models an actual cache write separately from a successful response.
      if (offlineFetchSaved(answer) && options.writeResult !== 'fail') {
        if (options.writeResult === 'delayed') delayed.push(url);
        else saved.add(url);
      }
      return answer;
    },
    clearCopies: async () => {
      order.push('clear');
      if (options.clearError) throw new Error('cache blocked');
      for (const name of [...names]) if (name.startsWith(cacheName('x').slice(0, -1))) names.delete(name);
    },
    wait: options.wait ?? (async () => undefined),
    storageEstimate: async () => options.estimate,
    cacheStorage: {
      keys: async () => [...names],
      open: async (name) => ({ match: async (url) => name === activeName && saved.has(url) ? storableResponse() : undefined }),
    },
    onState: (state) => { statuses.push(state); },
  };
  return {
    env, calls, order, names, statuses, saved,
    releaseWrites: () => {
      for (const url of delayed.splice(0)) saved.add(url);
      releaseWriteWait();
    },
    released,
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

describe('validating saved responses (W07-2 review)', () => {
  it('recognizes a full cacheable success and refuses partial or redirected answers', () => {
    expect(offlineFetchSaved(storableResponse())).toBe(true);
    expect(offlineFetchSaved({ ...storableResponse(), status: 206 })).toBe(false);
    expect(offlineFetchSaved({ ...storableResponse(), redirected: true })).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['non-response boolean', true],
    ['empty object', {}],
    ['only ok flag', { ok: true }],
    ['missing headers', { ok: true, status: 200, type: 'basic', redirected: false }],
    ['invalid headers', { ...storableResponse(), headers: { get: 5 } }],
    ['default response type', { ...storableResponse(), type: 'default' }],
  ])('does not report ready when fetch resolves to %s', async (_name, result) => {
    expect(offlineFetchSaved(result)).toBe(false);
    const x = setup({ fetchOne: async () => result });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'unavailable']);
  });
});

describe('confirming actual saved copies', () => {
  it('discards an obsolete failure estimate after a new controller has saved the visit', async () => {
    const x = setup({ controlled: true });
    let releaseOldEstimate: (value: { usage: number; quota: number }) => void = () => undefined;
    const oldEstimate = new Promise<{ usage: number; quota: number }>((resolve) => { releaseOldEstimate = resolve; });
    let announceOldEstimate: () => void = () => undefined;
    const estimating = new Promise<void>((resolve) => { announceOldEstimate = resolve; });
    let announceReady: () => void = () => undefined;
    const replacementReady = new Promise<void>((resolve) => { announceReady = resolve; });
    let estimates = 0;
    x.env.storageEstimate = () => {
      if (++estimates === 1) {
        announceOldEstimate();
        return oldEstimate;
      }
      return Promise.resolve({ usage: 1, quota: 100 });
    };
    x.env.onState = (state) => {
      x.statuses.push(state);
      if (state === 'ready') announceReady();
    };

    const started = startOffline(x.env);
    await estimating;
    x.changeController();
    await replacementReady;
    expect(x.statuses).toEqual(['saving', 'ready']);
    releaseOldEstimate({ usage: 1, quota: 100 });
    await started;

    expect(x.saved.size).toBe(2);
    expect(x.statuses).toEqual(['saving', 'ready']);
  });

  it('requires all planned URLs in one Cueory cache and ignores stale and foreign caches', async () => {
    const x = setup();
    expect(await offlineCopiesPresent(x.env.cacheStorage, [PAGE])).toBe(false);
    x.saved.add(PAGE);
    expect(await offlineCopiesPresent(x.env.cacheStorage, [PAGE])).toBe(true);
    expect(await offlineCopiesPresent(x.env.cacheStorage, [PAGE, ORIGIN + '/_astro/app.abc123.js'])).toBe(false);
    x.saved.add(ORIGIN + '/_astro/app.abc123.js');
    expect(await offlineCopiesPresent(x.env.cacheStorage, [PAGE, ORIGIN + '/_astro/app.abc123.js'])).toBe(true);
    x.names.add(cacheName('stale'));
    expect(await offlineCopiesPresent(x.env.cacheStorage, [PAGE, ORIGIN + '/_astro/app.abc123.js'])).toBe(false);
    x.names.delete(cacheName('stale'));
    expect(await offlineCopiesPresent(x.env.cacheStorage, [])).toBe(false);
  });

  it('does not report ready after a cache-write rejection when the quota estimate is inconclusive', async () => {
    const x = setup({ writeResult: 'fail', estimate: { usage: 1, quota: 100 } });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'unavailable']);
    expect(x.saved.size).toBe(0);
  });

  it('waits for deferred cache writes rather than prematurely declaring ready', async () => {
    const x = setup({ writeResult: 'delayed' });
    let notifyPolling: () => void = () => undefined;
    const polling = new Promise<void>((resolve) => { notifyPolling = resolve; });
    x.env.wait = async () => { notifyPolling(); await x.released; };
    const started = startOffline(x.env);
    await polling;
    expect(x.statuses).toEqual(['saving']);
    expect(x.saved.size).toBe(0);
    x.releaseWrites();
    await started;
    expect(x.statuses).toEqual(['saving', 'ready']);
  });

  it('does not say ready for an already controlling worker with no saved copies', async () => {
    const x = setup({ controlled: true, estimate: { usage: 1, quota: 100 } });
    await startOffline(x.env);
    expect(x.statuses).toEqual(['saving', 'unavailable']);
    expect(x.calls).toEqual(['register:/sw.js:/']);
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
      fetchOne: async url => { if (url.endsWith('/a.js')) throw new Error('network'); return storableResponse(); },
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
      fetchOne: async url => { if (url.endsWith('/a.js')) throw { name: 'QuotaExceededError' }; return storableResponse(); },
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

  it('handles registration rejection without claiming readiness', async () => {
    const rejected = setup({ registerError: new Error('denied') });
    await startOffline(rejected.env);
    expect(rejected.statuses).toEqual(['saving', 'unavailable']);
  });

  it('waits for a slow initial installation without prematurely reporting a failure', async () => {
    let releaseReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => { releaseReady = resolve; });
    const pending = setup({ ready, wait: async () => undefined });
    const started = startOffline(pending.env);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(pending.statuses).toEqual(['saving']);
    expect(pending.calls).toEqual(['register:/sw.js:/']);
    releaseReady();
    await started;
    expect(pending.statuses).toEqual(['saving', 'ready']);
  });

  it('handles later worker activation and refreshes the saved visit', async () => {
    const x = setup({ controlled: true, initiallyStored: true });
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

/** Exercise the actual sw.ts fetch handler and its event.waitUntil(cache.put) behavior. */
describe('service-worker writes wired to the page-side readiness check', () => {
  const read = (file: string) => readFileSync('src/scripts/' + file, 'utf8');
  const bundle = buildServiceWorker(['offlineplan.ts', 'swlogic.ts', 'sw.ts'].map(read), 'w07-2-integration');

  function connectedWorker(writeMode: 'reject' | 'delayed' | 'complete') {
    const entries = new Map<string, Map<string, Response>>();
    const listeners = new Map<string, ((event: any) => void)[]>();
    const pending: Promise<unknown>[] = [];
    const releases: Array<() => void> = [];
    let writes = 0;
    let successes = 0;
    let controller: unknown;
    const basic = () => Object.defineProperty(new Response('[sample page]'), 'type', { value: 'basic' });
    const cacheStorage = {
      keys: async () => [...entries.keys()],
      open: async (name: string) => {
        if (!entries.has(name)) entries.set(name, new Map());
        const cache = entries.get(name)!;
        return {
          match: async (url: string) => cache.get(url)?.clone(),
          put: (url: string, response: Response) => {
            writes += 1;
            if (writeMode === 'reject') return Promise.reject({ name: 'QuotaExceededError' });
            if (writeMode === 'delayed') return new Promise<void>((resolve) => {
              releases.push(() => { cache.set(url, response); successes += 1; resolve(); });
            });
            cache.set(url, response);
            successes += 1;
            return Promise.resolve();
          },
        };
      },
    };
    const self = {
      location: { origin: ORIGIN },
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
      addEventListener: (name: string, listener: (event: any) => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      },
    };
    vm.runInNewContext(bundle, { self, caches: cacheStorage, fetch: async () => basic(), URL, Promise, Response, Error, setTimeout });
    const statuses: OfflineState[] = [];
    const env: OfflineEnvironment = {
      serviceWorker: {
        get controller() { return controller; },
        ready: Promise.resolve({}),
        register: async () => { controller = {}; return {}; },
        addEventListener: () => undefined,
        getRegistrations: async () => [],
      },
      secure: true, enabled: true, origin: ORIGIN, pageUrl: PAGE,
      resources: () => ['/_astro/app.abc123.js'],
      fetchOne: async (url) => {
        const request = new Request(url);
        let answer: Promise<Response> | undefined;
        const event = {
          request,
          waitUntil: (task: Promise<unknown>) => { pending.push(task); },
          respondWith: (task: Promise<Response>) => { answer = task; },
        };
        for (const fn of listeners.get('fetch') ?? []) fn(event);
        if (!answer) throw new Error('Worker did not handle public URL');
        return answer;
      },
      cacheStorage, storageEstimate: async () => ({ usage: 1, quota: 100 }),
      clearCopies: async () => undefined, wait: async () => undefined,
      onState: (state) => statuses.push(state),
    };
    return { env, statuses, entries, pending, releases, get writes() { return writes; }, get successes() { return successes; } };
  }

  it('refuses false-ready when actual worker cache.put rejects in waitUntil', async () => {
    const x = connectedWorker('reject');
    await startOffline(x.env);
    await Promise.all(x.pending);
    expect(x.writes).toBe(2);
    expect(x.successes).toBe(0);
    expect(x.statuses).toEqual(['saving', 'unavailable']);
    expect(await offlineCopiesPresent(x.env.cacheStorage, [PAGE])).toBe(false);
  });

  it('does not announce ready until actual delayed worker writes are visible', async () => {
    const x = connectedWorker('delayed');
    let announcePoll: () => void = () => undefined;
    const pollStarted = new Promise<void>((resolve) => { announcePoll = resolve; });
    let permitNextCheck: () => void = () => undefined;
    const resume = new Promise<void>((resolve) => { permitNextCheck = resolve; });
    x.env.wait = async () => { announcePoll(); await resume; };
    const running = startOffline(x.env);
    await pollStarted;
    expect(x.statuses).toEqual(['saving']);
    expect(x.successes).toBe(0);
    expect(x.releases.length).toBe(2);
    for (const release of x.releases) release();
    permitNextCheck();
    await running;
    await Promise.all(x.pending);
    expect(x.successes).toBe(2);
    expect(x.statuses).toEqual(['saving', 'ready']);
    expect(await offlineCopiesPresent(x.env.cacheStorage, [PAGE, ORIGIN + '/_astro/app.abc123.js'])).toBe(true);
  });
});
