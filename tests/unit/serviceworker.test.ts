import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cacheName } from '../../src/scripts/offlineplan';
import { registerOffline } from '../../src/scripts/offline';
import { buildServiceWorker } from '../../src/scripts/swbuild';
import { staleCaches, storable, strategyFor } from '../../src/scripts/swlogic';

const ORIGIN = 'https://cueory.app';
const get = (url: string) => ({ method: 'GET', url });
const answer = (overrides: Partial<{ ok: boolean; status: number; type: string; redirected: boolean; cache: string | null }> = {}) => {
  const { cache = null, ...rest } = overrides;
  return { ok: true, status: 200, type: 'basic', redirected: false, ...rest, headers: { get: (name: string) => (name.toLowerCase() === 'cache-control' ? cache : null) } };
};

describe('which requests the worker answers, and how', () => {
  it.each([
    ['/', 'network-first'], ['/play', 'network-first'], ['/learn/study-skills', 'network-first'],
    ['/learn/study-skills/cards', 'network-first'], ['/brand/v1/logo.png', 'network-first'], ['/fonts/inter.woff2', 'network-first'],
    ['/_astro/cards.abc123.js', 'cache-first'], ['https://cueory.app/_astro/x.css', 'cache-first'],
  ])('answers %s %s', (url, strategy) => {
    expect(strategyFor(get(url), ORIGIN)).toBe(strategy);
  });

  it.each(['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'])('leaves a %s request alone', (method) => {
    expect(strategyFor({ method, url: '/learn/study-skills' }, ORIGIN)).toBeNull();
  });

  it.each([
    '/admin', '/admin/questions', '/progress', '/start', '/privacy', '/subscribed', '/sw.js', '/learn',
    '/play/data/today.json', '/play/anything', '/play.json', '/api/check',
    'https://example.com/learn/study-skills', 'https://cueory.app.evil.example/learn/x', '//evil.example/learn/x',
  ])('leaves %s alone', (url) => {
    expect(strategyFor(get(url), ORIGIN)).toBeNull();
  });

  it.each([
    '/learn/study-skills?x=1', '/play?mode=daily', '/learn/study-skills?token=abc', '/learn/x?code=1', '/learn/x?key=1', '/_astro/a.js?v=1', '/?',
  ])('leaves a request with a query string alone: %s', (url) => {
    // A bare "?" is also a query string for this purpose only when it has content; "/?" has none.
    expect(strategyFor(get(url), ORIGIN)).toBe(url === '/?' ? 'network-first' : null);
  });
});

describe('which answers may be kept', () => {
  it('keeps a complete answer from this site', () => {
    expect(storable(answer())).toBe(true);
    expect(storable(answer({ cache: 'public, max-age=60' }))).toBe(true);
  });

  it.each([
    [{ ok: false, status: 404 }], [{ ok: false, status: 500 }], [{ status: 206 }], [{ status: 204 }],
    [{ type: 'opaque' }], [{ type: 'cors' }], [{ type: 'opaqueredirect' }], [{ type: 'error' }],
    [{ redirected: true }], [{ cache: 'no-store' }], [{ cache: 'private' }], [{ cache: 'max-age=0, No-Store' }], [{ cache: 'private, max-age=5' }],
  ])('refuses %j', (overrides) => {
    expect(storable(answer(overrides))).toBe(false);
  });
});

describe('which caches are deleted when a new worker starts', () => {
  it('deletes only our own caches from other builds', () => {
    const names = [cacheName('old-1'), cacheName('new'), cacheName('old-2'), 'workbox-precache', 'someone-else', 'cueory-offline'];
    expect(staleCaches(names, 'new')).toEqual([cacheName('old-1'), cacheName('old-2')]);
  });
  it('deletes nothing when only the current cache exists', () => {
    expect(staleCaches([cacheName('new')], 'new')).toEqual([]);
    expect(staleCaches([], 'new')).toEqual([]);
  });
});

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const sources = ['src/scripts/offlineplan.ts', 'src/scripts/swlogic.ts', 'src/scripts/sw.ts'].map(read);

describe('building /sw.js', () => {
  const built = buildServiceWorker(sources, 'abc123-0f0f0f0f');

  it('is one plain script: no imports, exports, types or placeholder left', () => {
    expect(built).not.toMatch(/^\s*(import|export)\b/m);
    expect(built).not.toContain('__BUILD_VERSION__');
    expect(built).not.toMatch(/\binterface\b|: Request\b|as unknown as/);
    expect(built).toContain("'abc123-0f0f0f0f'");
    expect(() => new vm.Script(built)).not.toThrow();
  });

  it.each(['', 'a b', "a'b", 'a\nb', '../x', 'x'.repeat(65), '<script>'])('refuses the version %j', (version) => {
    expect(() => buildServiceWorker(sources, version)).toThrow();
  });

  it('refuses sources with no version placeholder', () => {
    expect(() => buildServiceWorker([sources[0]!], 'abc')).toThrow(/placeholder/);
  });

  it('has no network address, storage of answers or eval in it', () => {
    expect(built).not.toMatch(/https?:\/\//);
    expect(built).not.toMatch(/\beval\b|new Function|importScripts|localStorage/);
  });
});

/** A Response as a browser gives one for this site's own address: `new Response()` alone says type "default". */
const basic = (body: string, init: ResponseInit = { status: 200 }) => Object.defineProperty(new Response(body, init), 'type', { value: 'basic' });

/** Runs the built worker against stand-ins for the worker scope, the cache and the network. */
function run(version: string, existing: string[] = []) {
  const stores = new Map<string, Map<string, Response>>(existing.map((name) => [name, new Map()]));
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  const calls = { fetch: [] as string[], skipWaiting: 0, claim: 0 };
  let network: (request: { url: string }) => Promise<Response> = async () => basic('page');
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return { put: async (key: string, value: Response) => void store.set(key, value), match: async (key: string) => store.get(key)?.clone() };
  };
  const scope = {
    location: { origin: ORIGIN },
    clients: { claim: async () => void (calls.claim += 1) },
    skipWaiting: async () => void (calls.skipWaiting += 1),
    addEventListener: (type: string, listener: (event: unknown) => void) => (listeners[type] ??= []).push(listener),
  };
  const context = vm.createContext({
    self: scope,
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => cache(name),
    },
    fetch: async (request: { url: string }) => {
      calls.fetch.push(request.url);
      return network(request);
    },
    URL, Promise, Response,
  });
  vm.runInContext(buildServiceWorker(sources, version), context);

  const settle = async (work: Promise<unknown>[]) => void (await Promise.all(work));
  async function fire(type: string, request?: { method: string; url: string }) {
    const work: Promise<unknown>[] = [];
    let answered: Promise<Response> | undefined;
    const event = {
      request, waitUntil: (promise: Promise<unknown>) => work.push(promise),
      respondWith: (promise: Promise<Response>) => { answered = promise; },
    };
    for (const listener of listeners[type] ?? []) listener(event);
    const response = answered ? await answered.catch((error: unknown) => error) : undefined;
    await settle(work);
    return { handled: answered !== undefined, response };
  }
  return { stores, calls, fire, setNetwork: (next: typeof network) => { network = next; } };
}

describe('the built worker', () => {
  const page = { method: 'GET', url: `${ORIGIN}/learn/study-skills` };

  it('takes over at once and deletes only our old caches on activate', async () => {
    const worker = run('v2', [cacheName('v1'), cacheName('v2'), 'unrelated']);
    await worker.fire('install');
    expect(worker.calls.skipWaiting).toBe(1);
    await worker.fire('activate');
    expect([...worker.stores.keys()].sort()).toEqual([cacheName('v2'), 'unrelated'].sort());
    expect(worker.calls.claim).toBe(1);
  });

  it('keeps a page when online, and serves that copy when the network fails', async () => {
    const worker = run('v1');
    expect(((await worker.fire('fetch', page)).response as Response).status).toBe(200);
    expect([...worker.stores.get(cacheName('v1'))!.keys()]).toEqual([page.url]);
    worker.setNetwork(async () => { throw new TypeError('offline'); });
    const offline = (await worker.fire('fetch', page)).response as Response;
    expect(await offline.text()).toBe('page');
  });

  it('fails like the browser would when offline with nothing kept', async () => {
    const worker = run('v1');
    worker.setNetwork(async () => { throw new TypeError('offline'); });
    expect((await worker.fire('fetch', page)).response).toBeInstanceOf(TypeError);
  });

  it('prefers the network for a page: a newer page replaces the kept copy', async () => {
    const worker = run('v1');
    await worker.fire('fetch', page);
    worker.setNetwork(async () => basic('newer'));
    expect(await ((await worker.fire('fetch', page)).response as Response).text()).toBe('newer');
    worker.setNetwork(async () => { throw new TypeError('offline'); });
    expect(await ((await worker.fire('fetch', page)).response as Response).text()).toBe('newer');
  });

  it('serves a built file from the cache without asking the network again', async () => {
    const worker = run('v1');
    const asset = { method: 'GET', url: `${ORIGIN}/_astro/cards.abc123.js` };
    await worker.fire('fetch', asset);
    await worker.fire('fetch', asset);
    expect(worker.calls.fetch).toEqual([asset.url]);
  });

  it.each([
    ['a POST', { method: 'POST', url: `${ORIGIN}/learn/study-skills` }],
    ['/admin', { method: 'GET', url: `${ORIGIN}/admin` }],
    ['a page with a query string', { method: 'GET', url: `${ORIGIN}/learn/study-skills?token=1` }],
    ['/play puzzle data', { method: 'GET', url: `${ORIGIN}/play/data/today.json` }],
    ['another site', { method: 'GET', url: 'https://example.com/learn/study-skills' }],
  ])('does not touch %s', async (_name, request) => {
    const worker = run('v1');
    const result = await worker.fire('fetch', request);
    expect(result.handled).toBe(false);
    expect(worker.calls.fetch).toEqual([]);
    expect(worker.stores.size).toBe(0);
  });

  it.each([
    ['an error page', () => basic('nope', { status: 404 })],
    ['a no-store page', () => basic('x', { status: 200, headers: { 'Cache-Control': 'no-store' } })],
    ['a private page', () => basic('x', { status: 200, headers: { 'Cache-Control': 'private' } })],
    ['a partial answer', () => basic('x', { status: 206 })],
  ])('answers but does not keep %s', async (_name, make) => {
    const worker = run('v1');
    worker.setNetwork(async () => make());
    await worker.fire('fetch', page);
    expect(worker.stores.get(cacheName('v1'))?.size ?? 0).toBe(0);
  });

  it('does not keep a redirect (a locked preview sends visitors to its sign-in page)', async () => {
    const worker = run('v1');
    worker.setNetwork(async () => Object.defineProperty(basic('login'), 'redirected', { value: true }));
    expect((await worker.fire('fetch', page)).handled).toBe(true);
    expect(worker.stores.get(cacheName('v1'))?.size ?? 0).toBe(0);
  });
});

describe('registering the worker', () => {
  const registrations: { url: string; options: { scope: string } }[] = [];
  const nav = (fail = false) => ({
    serviceWorker: {
      register: (url: string, options: { scope: string }) => {
        registrations.push({ url, options });
        return fail ? Promise.reject(new Error('refused')) : Promise.resolve({});
      },
    },
  });

  it('registers /sw.js for the whole site on a secure page', async () => {
    registrations.length = 0;
    await registerOffline(nav(), true);
    expect(registrations).toEqual([{ url: '/sw.js', options: { scope: '/' } }]);
  });

  it('does nothing on an insecure page or in a browser without service workers', () => {
    registrations.length = 0;
    expect(registerOffline(nav(), false)).toBeUndefined();
    expect(registerOffline({}, true)).toBeUndefined();
    expect(registrations).toEqual([]);
  });

  it('stays quiet when registration is refused', async () => {
    await expect(registerOffline(nav(true), true)).resolves.toBeUndefined();
  });
});
