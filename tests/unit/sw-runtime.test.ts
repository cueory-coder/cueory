/** W07: exercise the real service-worker event handlers, not only their pure routing helpers. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheName } from '../../src/scripts/offlineplan';

const ORIGIN = 'https://cueory.app';
const CURRENT = cacheName('__BUILD_VERSION__');

type EventStub = {
  request?: Request;
  waitUntil(work: Promise<unknown>): void;
  respondWith(answer: Promise<Response>): void;
};

type Network = (request: Request) => Promise<Response>;

/** Node's Response has type "default"; the site's own network responses have type "basic". */
function basic(body: string, init: ResponseInit = {}): Response {
  return Object.defineProperty(new Response(body, init), 'type', { value: 'basic' });
}

async function runWorker(initialCaches: string[] = []) {
  vi.resetModules();
  const stores = new Map(initialCaches.map((name) => [name, new Map<string, Response>()]));
  const listeners = new Map<string, ((event: EventStub) => void)[]>();
  const fetches: string[] = [];
  const cacheWrites: string[] = [];
  const deleted: string[] = [];
  const timers: number[] = [];
  let skips = 0;
  let claims = 0;
  let failOpen = false;
  let failPut = false;
  let network: Network = async () => basic('network');

  vi.stubGlobal('self', {
    location: { origin: ORIGIN },
    clients: { claim: async () => { claims += 1; } },
    skipWaiting: async () => { skips += 1; },
    addEventListener: (type: string, listener: (event: EventStub) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  });
  vi.stubGlobal('caches', {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => { deleted.push(name); return stores.delete(name); },
    open: async (name: string) => {
      if (failOpen) throw new Error('cache unavailable');
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (url: string) => store.get(url)?.clone(),
        put: async (url: string, response: Response) => {
          if (failPut) throw new Error('disk full');
          cacheWrites.push(url);
          store.set(url, response);
        },
      };
    },
  });
  vi.stubGlobal('fetch', (request: Request) => {
    fetches.push(request.url);
    return network(request);
  });
  // No real timer is needed: for a cached page these tests let the network settle first.
  vi.stubGlobal('setTimeout', (_callback: () => void, delay: number) => { timers.push(delay); return 0; });

  await import('../../src/scripts/sw');

  function dispatch(type: string, request?: Request) {
    const lifetime: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    for (const listener of listeners.get(type) ?? []) {
      listener({
        request,
        waitUntil: (work) => lifetime.push(work),
        respondWith: (response) => { answer = response; },
      });
    }
    return {
      intercepted: answer !== undefined,
      settle: async () => {
        const response = answer ? await answer : undefined;
        await Promise.all(lifetime);
        return response;
      },
    };
  }

  return {
    dispatch, stores, fetches, cacheWrites, deleted, timers,
    get skips() { return skips; },
    get claims() { return claims; },
    setNetwork(next: Network) { network = next; },
    setCacheUnavailable(value: boolean) { failOpen = value; },
    setWriteFailure(value: boolean) { failPut = value; },
  };
}

const request = (path: string, method = 'GET') => new Request(new URL(path, ORIGIN), { method });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('sw.ts fetch event: privacy boundary', () => {
  const privatePaths = [
    '/preview', '/preview/', '/preview/share', '/preview/states',
    '/account', '/account/', '/account/settings', '/account/two-factor',
    '/admin', '/admin/', '/admin/flags',
    '/auth', '/auth/callback', '/auth/callback?code=sample',
    '/signin', '/signup', '/reset-password',
    '/progress', '/start', '/privacy', '/subscribed', '/breaks',
    '/play', '/play/', '/play/data/today.json',
    '/api/check', '/api/questions',
    '/learn/study-skills/questions/sample.json',
    '/learn/study-skills?token=sample', '/_astro/app.js?v=1',
    'https://example.com/learn/study-skills',
  ];

  it.each(privatePaths)('does not intercept or cache %s', async (path) => {
    const worker = await runWorker();
    const event = worker.dispatch('fetch', request(path));
    expect(event.intercepted).toBe(false);
    expect(await event.settle()).toBeUndefined();
    expect(worker.fetches).toEqual([]);
    expect(worker.cacheWrites).toEqual([]);
    expect(worker.stores.size).toBe(0);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('does not intercept %s on an otherwise public page', async (method) => {
    const worker = await runWorker();
    const event = worker.dispatch('fetch', request('/learn/study-skills', method));
    expect(event.intercepted).toBe(false);
    expect(worker.fetches).toEqual([]);
    expect(worker.stores.size).toBe(0);
  });
});

describe('sw.ts runtime fetch and lifecycle behavior', () => {
  it('installs immediately, removes only stale site caches, and claims clients after cleanup', async () => {
    const worker = await runWorker([cacheName('older'), CURRENT, 'cueory-offline', 'another-app']);
    await worker.dispatch('install').settle();
    expect(worker.skips).toBe(1);
    await worker.dispatch('activate').settle();
    expect(worker.deleted).toEqual([cacheName('older')]);
    expect([...worker.stores.keys()]).toEqual([CURRENT, 'cueory-offline', 'another-app']);
    expect(worker.claims).toBe(1);
  });

  it('caches a public lesson network-first and uses its copy when offline', async () => {
    const worker = await runWorker();
    const page = request('/learn/study-skills');
    expect(await (await worker.dispatch('fetch', page).settle())?.text()).toBe('network');
    expect(worker.cacheWrites).toEqual([page.url]);
    worker.setNetwork(async () => { throw new TypeError('offline'); });
    expect(await (await worker.dispatch('fetch', page).settle())?.text()).toBe('network');
    expect(worker.fetches).toEqual([page.url, page.url]);
  });

  it('uses cached hashed assets without another network request', async () => {
    const worker = await runWorker();
    const asset = request('/_astro/app.abc123.js');
    await worker.dispatch('fetch', asset).settle();
    worker.setNetwork(async () => basic('new response'));
    expect(await (await worker.dispatch('fetch', asset).settle())?.text()).toBe('network');
    expect(worker.fetches).toEqual([asset.url]);
    expect(worker.cacheWrites).toEqual([asset.url]);
  });

  it('never writes unsuccessful, private, redirected or partial responses', async () => {
    const cases = [
      () => basic('not found', { status: 404 }),
      () => basic('server error', { status: 503 }),
      () => basic('partial', { status: 206 }),
      () => basic('private', { headers: { 'Cache-Control': 'private, max-age=30' } }),
      () => basic('no store', { headers: { 'Cache-Control': 'no-store' } }),
      () => Object.defineProperty(basic('sign in'), 'redirected', { value: true }) as Response,
    ];
    for (const make of cases) {
      const worker = await runWorker();
      worker.setNetwork(async () => make());
      const event = worker.dispatch('fetch', request('/learn/study-skills'));
      expect(event.intercepted).toBe(true);
      await event.settle();
      expect(worker.cacheWrites).toEqual([]);
      expect(worker.stores.get(CURRENT)?.size ?? 0).toBe(0);
    }
  });

  it('still answers the network when cache access or writes fail', async () => {
    const worker = await runWorker();
    const page = request('/learn/study-skills');
    worker.setCacheUnavailable(true);
    expect(await (await worker.dispatch('fetch', page).settle())?.text()).toBe('network');
    worker.setCacheUnavailable(false);
    worker.setWriteFailure(true);
    expect(await (await worker.dispatch('fetch', page).settle())?.text()).toBe('network');
    expect(worker.cacheWrites).toEqual([]);
    expect(worker.fetches).toEqual([page.url, page.url]);
  });

  it('uses a cached page for a 5xx, but returns a 404 as received', async () => {
    const worker = await runWorker();
    const page = request('/learn/study-skills');
    await worker.dispatch('fetch', page).settle();
    worker.setNetwork(async () => basic('down', { status: 503 }));
    expect(await (await worker.dispatch('fetch', page).settle())?.text()).toBe('network');
    worker.setNetwork(async () => basic('missing', { status: 404 }));
    expect((await worker.dispatch('fetch', page).settle())?.status).toBe(404);
    expect(worker.cacheWrites).toEqual([page.url]);
  });

  it('propagates a network failure when no offline copy exists', async () => {
    const worker = await runWorker();
    worker.setNetwork(async () => { throw new TypeError('offline'); });
    await expect(worker.dispatch('fetch', request('/learn/study-skills')).settle()).rejects.toThrow('offline');
  });
});
