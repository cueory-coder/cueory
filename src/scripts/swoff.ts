/**
 * The switched-off service worker (src/config/site.ts, `offline.enabled`, docs/OFFLINE.md). Served as /sw.js instead of
 * the real one: it deletes every saved copy this site made and removes itself, so a visitor's browser goes back to
 * asking the network for everything. Built with offlineplan.ts by src/pages/sw.js.ts.
 */
import { cacheName } from './offlineplan';

interface ExtendableEventLike {
  waitUntil(work: Promise<unknown>): void;
}
interface WorkerScope {
  registration: { unregister(): Promise<boolean> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
}

const worker = self as unknown as WorkerScope;
const OURS = cacheName('x').slice(0, -1);

worker.addEventListener('install', (event) => {
  event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith(OURS)).map((name) => caches.delete(name))))
      .then(() => worker.registration.unregister()),
  );
});
