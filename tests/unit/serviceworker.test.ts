import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { cacheName } from '../../src/scripts/offlineplan';
import { firstVisitUrls, startOffline, type OfflineEnvironment, type WorkerContainer } from '../../src/scripts/offline';
import { buildPlainScript, buildServiceWorker } from '../../src/scripts/swbuild';
import { NETWORK_WAIT_MS, preferSaved, staleCaches, storable, strategyFor } from '../../src/scripts/swlogic';

const ORIGIN = 'https://cueory.app';
const get = (url: string) => ({ method: 'GET', url });
const answer = (overrides: Partial<{ ok: boolean; status: number; type: string; redirected: boolean; cache: string | null }> = {}) => {
  const { cache = null, ...rest } = overrides;
  return { ok: true, status: 200, type: 'basic', redirected: false, ...rest, headers: { get: (name: string) => (name.toLowerCase() === 'cache-control' ? cache : null) } };
};

describe('which requests the worker answers, and how', () => {
  it.each([
    ['/', 'network-first'], ['/learn/study-skills', 'network-first'],
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
    '/play', '/play/', '/play/data/today.json', '/play/anything', '/play.json', '/api/check',
    'https://example.com/learn/study-skills', 'https://cueory.app.evil.example/learn/x', '//evil.example/learn/x',
  ])('leaves %s alone', (url) => {
    expect(strategyFor(get(url), ORIGIN)).toBeNull();
  });

  it.each([
    '/learn/study-skills?x=1', '/play?mode=daily', '/learn/study-skills/questions/study-skills-01.json', '/learn/data.json', '/_astro/data.json', '/learn/study-skills?token=abc', '/learn/x?code=1', '/learn/x?key=1', '/_astro/a.js?v=1', '/?',
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
function run(version: string, existing: string[] = [], script?: string) {
  const stores = new Map<string, Map<string, Response>>(existing.map((name) => [name, new Map()]));
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  const calls = { fetch: [] as string[], skipWaiting: 0, claim: 0, unregister: 0 };
  const timers: { fn: () => void; ms: number }[] = [];
  const failure = { cache: false };
  let network: (request: { url: string }) => Promise<Response> = async () => basic('page');
  const cache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return { put: async (key: string, value: Response) => void store.set(key, value), match: async (key: string) => store.get(key)?.clone() };
  };
  const scope = {
    location: { origin: ORIGIN },
    clients: { claim: async () => void (calls.claim += 1) },
    registration: { unregister: async () => void (calls.unregister += 1) },
    skipWaiting: async () => void (calls.skipWaiting += 1),
    addEventListener: (type: string, listener: (event: unknown) => void) => (listeners[type] ??= []).push(listener),
  };
  const context = vm.createContext({
    self: scope,
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        if (failure.cache) throw new Error('cache unavailable');
        return cache(name);
      },
    },
    fetch: async (request: { url: string }) => {
      calls.fetch.push(request.url);
      return network(request);
    },
    URL, Promise, Response, Error,
    setTimeout: (fn: () => void, ms: number) => void timers.push({ fn, ms }),
  });
  vm.runInContext(script ?? buildServiceWorker(sources, version), context);

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
  return { stores, calls, fire, timers, listeners, failure, setNetwork: (next: typeof network) => { network = next; } };
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

describe('a slow or failing network', () => {
  const page = { method: 'GET', url: `${ORIGIN}/learn/study-skills` };
  const settled = () => new Promise((resolve) => setImmediate(resolve));

  it('shows the saved copy when the network is slower than the wait, and still saves the late answer', async () => {
    const worker = run('v1');
    await worker.fire('fetch', page);
    let release: (response: Response) => void = () => undefined;
    worker.setNetwork(() => new Promise<Response>((resolve) => { release = resolve; }));
    const pending = worker.fire('fetch', page);
    await settled();
    expect(worker.timers.map((timer) => timer.ms)).toEqual([NETWORK_WAIT_MS]);
    worker.timers[0]!.fn();
    release(basic('late'));
    expect(await ((await pending).response as Response).text()).toBe('page');
    expect(await worker.stores.get(cacheName('v1'))!.get(page.url)!.text()).toBe('late');
  });

  it('shows the saved copy for a server error, but not a missing page', async () => {
    const worker = run('v1');
    await worker.fire('fetch', page);
    worker.setNetwork(async () => basic('down', { status: 503 }));
    expect(await ((await worker.fire('fetch', page)).response as Response).text()).toBe('page');
    worker.setNetwork(async () => basic('gone', { status: 404 }));
    const missing = (await worker.fire('fetch', page)).response as Response;
    expect(missing.status).toBe(404);
    expect(await worker.stores.get(cacheName('v1'))!.get(page.url)!.text()).toBe('page');
  });

  it('gives a server error as it is when nothing is saved, and does not start a wait', async () => {
    const worker = run('v1');
    worker.setNetwork(async () => basic('down', { status: 500 }));
    const result = (await worker.fire('fetch', page)).response as Response;
    expect(result.status).toBe(500);
    expect(worker.timers).toEqual([]);
    expect(worker.stores.get(cacheName('v1'))?.size ?? 0).toBe(0);
  });

  it('only prefers a saved copy over a 5xx', () => {
    expect([200, 301, 304, 400, 404, 499].map((status) => preferSaved({ status }))).toEqual([false, false, false, false, false, false]);
    expect([500, 502, 503, 599].map((status) => preferSaved({ status }))).toEqual([true, true, true, true]);
  });
});

describe('a cache that cannot be read', () => {
  const page = { method: 'GET', url: `${ORIGIN}/learn/study-skills` };
  const asset = { method: 'GET', url: `${ORIGIN}/_astro/cards.abc123.js` };

  it.each([['a page', page], ['a built file', asset]])('still gets %s from the network', async (_name, request) => {
    const worker = run('v1');
    worker.failure.cache = true;
    const result = (await worker.fire('fetch', request)).response as Response;
    expect(await result.text()).toBe('page');
    expect(worker.calls.fetch).toEqual([request.url]);
  });
});

describe('the switched-off worker', () => {
  const off = buildPlainScript([sources[0]!, read('src/scripts/swoff.ts')]);

  it('has no fetch handler: it saves and answers nothing', () => {
    const worker = run('x', [], off);
    expect(worker.listeners.fetch).toBeUndefined();
    expect(off).not.toMatch(/\bfetch\b/);
  });

  it('deletes only our saved copies on activate and removes itself', async () => {
    const worker = run('x', [cacheName('v1'), cacheName('v2'), 'unrelated'], off);
    await worker.fire('install');
    expect(worker.calls.skipWaiting).toBe(1);
    await worker.fire('activate');
    expect([...worker.stores.keys()]).toEqual(['unrelated']);
    expect(worker.calls.unregister).toBe(1);
  });
});

describe('the registration script', () => {
  it('is one plain script with no import, export or type left', () => {
    const script = buildPlainScript([sources[0]!, read('src/scripts/swlogic.ts'), read('src/scripts/offline.ts')]);
    expect(script).not.toMatch(/^\s*(import|export)\b/m);
    expect(script).not.toMatch(/\binterface\b|as WorkerContainer|: Promise</);
    expect(() => new vm.Script(script)).not.toThrow();
    expect(script).not.toMatch(/https?:\/\//);
  });
});

describe('what a first visit saves', () => {
  const page = `${ORIGIN}/learn/study-skills`;
  it('is the page, then the files it loaded that the worker would keep, each once', () => {
    expect(
      firstVisitUrls(`${page}#top`, [`${ORIGIN}/_astro/a.js`, `${ORIGIN}/_astro/a.js`, '/_astro/b.css', `${ORIGIN}/fonts/inter.woff2`], ORIGIN),
    ).toEqual([page, `${ORIGIN}/_astro/a.js`, `${ORIGIN}/_astro/b.css`, `${ORIGIN}/fonts/inter.woff2`]);
  });

  it('leaves out everything the worker would not keep', () => {
    expect(
      firstVisitUrls(`${ORIGIN}/play`, [
        `${ORIGIN}/_astro/data.json`, `${ORIGIN}/learn/study-skills/q.json`, `${ORIGIN}/admin`, 'https://static.cloudflareinsights.com/beacon.min.js',
        `${ORIGIN}/learn/x?token=1`, 'not a url', `${ORIGIN}/pagefind/pagefind.js`, `${ORIGIN}/progress`,
      ], ORIGIN),
    ).toEqual([]);
  });

  it('stops at 60 addresses', () => {
    const many = Array.from({ length: 100 }, (_, index) => `${ORIGIN}/_astro/f${index}.js`);
    expect(firstVisitUrls(page, many, ORIGIN)).toHaveLength(60);
  });
});

describe('starting the offline copies from a page', () => {
  function environment(overrides: Partial<{ controller: boolean; failRegister: boolean; becomesController: boolean }> & Partial<OfflineEnvironment> = {}) {
    const { controller = false, failRegister = false, becomesController = true, ...rest } = overrides;
    const log = { registered: [] as { url: string; scope: string }[], unregistered: 0, fetched: [] as string[], waits: [] as number[], order: [] as string[] };
    let control: unknown = controller ? {} : undefined;
    const listeners: (() => void)[] = [];
    const container: WorkerContainer = {
      get controller() { return control; },
      ready: Promise.resolve({}),
      register: async (url, options) => {
        log.registered.push({ url, scope: options.scope });
        if (failRegister) throw new Error('refused');
        return {};
      },
      getRegistrations: async () => [{ unregister: async () => { log.order.push('unregistered'); log.unregistered += 1; return true; } }, { unregister: async () => { log.order.push('unregistered'); log.unregistered += 1; return true; } }],
      addEventListener: (_type, listener) => void listeners.push(listener),
    };
    const env: OfflineEnvironment = {
      serviceWorker: container, secure: true, enabled: true, origin: ORIGIN, pageUrl: `${ORIGIN}/learn/study-skills`,
      resources: () => [`${ORIGIN}/_astro/a.js`],
      fetchOne: async (url) => void log.fetched.push(url),
      clearCopies: async () => void log.order.push('cleared'),
      wait: async (ms) => {
        log.waits.push(ms);
        if (becomesController) { control = {}; for (const listener of listeners) listener(); }
        return new Promise<void>(() => undefined);
      },
      ...rest,
    };
    return { env, log, takeControl: () => { control = {}; for (const listener of listeners) listener(); } };
  }

  it('registers /sw.js for the whole site, then saves the first visit once the worker controls the page', async () => {
    const { env, log, takeControl } = environment({ becomesController: false });
    const started = startOffline(env);
    await new Promise((resolve) => setImmediate(resolve));
    takeControl();
    await started;
    expect(log.registered).toEqual([{ url: '/sw.js', scope: '/' }]);
    expect(log.fetched).toEqual([`${ORIGIN}/learn/study-skills`, `${ORIGIN}/_astro/a.js`]);
  });

  it('does not wait forever for control, and saves nothing if it never comes', async () => {
    const { env, log } = environment({ becomesController: false, wait: async () => undefined });
    await startOffline(env);
    expect(log.fetched).toEqual([]);
  });

  it('saves nothing extra on a later visit (the worker already controls the page and saves as it goes)', async () => {
    const { env, log } = environment({ controller: true });
    await startOffline(env);
    expect(log.registered).toHaveLength(1);
    expect(log.fetched).toEqual([]);
  });

  it('does nothing on an insecure page or in a browser without service workers', async () => {
    const insecure = environment();
    await startOffline({ ...insecure.env, secure: false });
    await startOffline({ ...insecure.env, serviceWorker: undefined });
    expect(insecure.log.registered).toEqual([]);
    expect(insecure.log.unregistered).toBe(0);
  });

  it('stays quiet when registration is refused, and saves nothing', async () => {
    const { env, log } = environment({ failRegister: true });
    await expect(startOffline(env)).resolves.toBeUndefined();
    expect(log.fetched).toEqual([]);
  });

  it('keeps going when one file cannot be fetched', async () => {
    const { env, log } = environment();
    await startOffline({ ...env, fetchOne: async (url) => { log.fetched.push(url); throw new Error('network'); } });
    expect(log.fetched).toHaveLength(2);
  });

  it('deletes the saved copies first, then removes every registration, and registers nothing, when switched off', async () => {
    const { env, log } = environment();
    await startOffline({ ...env, enabled: false });
    expect(log.order).toEqual(['cleared', 'unregistered', 'unregistered']);
    expect(log.registered).toEqual([]);
  });

  it('still removes the registrations when deleting the copies fails', async () => {
    const { env, log } = environment();
    await startOffline({ ...env, enabled: false, clearCopies: async () => { throw new Error('storage'); } });
    expect(log.unregistered).toBe(2);
  });
});
