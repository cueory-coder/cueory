/**
 * The offline service worker (ROADMAP Task 5). It runs in the browser's worker scope, never on a page, and is built
 * into /sw.js by src/pages/sw.js.ts together with offlineplan.ts and swlogic.ts (their imports and exports are removed,
 * so it's one plain file). The decisions are in swlogic.ts; this file only connects them to the worker's events.
 * Keep it free of syntax the build can't strip.
 */
import { cacheName } from './offlineplan';
import { NETWORK_WAIT_MS, preferSaved, staleCaches, storable, strategyFor } from './swlogic';

interface ExtendableEventLike {
  waitUntil(work: Promise<unknown>): void;
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(answer: Promise<Response>): void;
}
interface WorkerScope {
  location: { origin: string };
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
}

const worker = self as unknown as WorkerScope;
// Replaced at build time with the commit and a hash of this file's text, so each deploy has its own cache.
const VERSION = '__BUILD_VERSION__';
const CURRENT = cacheName(VERSION);

worker.addEventListener('install', (event) => {
  event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(staleCaches(names, VERSION).map((name) => caches.delete(name))))
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request, worker.location.origin);
  if (!strategy) return;
  event.respondWith(strategy === 'cache-first' ? cacheFirst(event) : networkFirst(event));
});

/** Keep a copy without making the student wait for it; a full disk just means no copy. */
function keep(event: FetchEventLike, response: Response): void {
  if (!storable(response)) return;
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(CURRENT)
      .then((cache) => cache.put(event.request.url, copy))
      .catch(() => undefined),
  );
}

/**
 * The network's answer, unless it is slow or fails: a page with a saved copy waits NETWORK_WAIT_MS, then shows the copy
 * (the slow answer still replaces the copy when it arrives). A server error (5xx) also shows the copy. A page with no
 * saved copy waits for the network as it would without a worker.
 */
async function networkFirst(event: FetchEventLike): Promise<Response> {
  const saved = await (await caches.open(CURRENT)).match(event.request.url);
  const fresh = fetch(event.request).then((response) => {
    keep(event, response);
    return response;
  });
  if (!saved) return fresh;
  event.waitUntil(fresh.catch(() => undefined));
  try {
    const response = await Promise.race([
      fresh,
      new Promise<never>((_, giveUp) => setTimeout(() => giveUp(new Error('slow')), NETWORK_WAIT_MS)),
    ]);
    return preferSaved(response) ? saved : response;
  } catch {
    return saved;
  }
}

async function cacheFirst(event: FetchEventLike): Promise<Response> {
  const cached = await (await caches.open(CURRENT)).match(event.request.url);
  if (cached) return cached;
  const response = await fetch(event.request);
  keep(event, response);
  return response;
}
