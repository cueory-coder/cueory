/**
 * The page side of the offline service worker (ROADMAP Task 5), served as the external file /register-sw.js by
 * src/pages/register-sw.js.ts (so no inline script, and no change to the content security policy) and loaded after the
 * page has parsed. It registers /sw.js once the page has finished loading, so it never competes with the page itself.
 * Only in a built site, only where the browser supports workers and the page is secure, and a failure is silent: the
 * site works the same without it. When `offline.enabled` is false (src/config/site.ts) it removes any registration
 * instead. Keep it free of syntax the build can't strip (it is joined with swlogic.ts and offlineplan.ts).
 */
import { cacheName } from './offlineplan';
import { strategyFor } from './swlogic';

interface WorkerRegistration {
  unregister(): Promise<boolean>;
}
export interface WorkerContainer {
  controller?: unknown;
  ready: Promise<unknown>;
  register(url: string, options: { scope: string }): Promise<unknown>;
  getRegistrations(): Promise<readonly WorkerRegistration[]>;
  addEventListener(type: 'controllerchange', listener: () => void, options?: { once: boolean }): void;
}
export interface OfflineEnvironment {
  serviceWorker?: WorkerContainer;
  secure: boolean;
  enabled: boolean;
  origin: string;
  pageUrl: string;
  /** Addresses this page has already loaded (the browser's resource timing list). */
  resources: () => readonly string[];
  fetchOne: (url: string) => Promise<unknown>;
  /** Deletes every saved copy this site made (and no other cache). */
  clearCopies: () => Promise<unknown>;
  wait: (milliseconds: number) => Promise<void>;
}

/** The most addresses fetched to save a first visit. */
const FIRST_VISIT_LIMIT = 60;
/** How long a first visit waits for the new worker to take control of the page. */
const CONTROL_WAIT_MS = 3000;

/**
 * What to fetch once so a first visit is saved: this page, then the files it loaded before the worker could keep them.
 * Only addresses the worker itself would keep (strategyFor), each once, this site only.
 */
export function firstVisitUrls(pageUrl: string, resources: readonly string[], origin: string): string[] {
  const wanted: string[] = [];
  for (const candidate of [pageUrl, ...resources]) {
    let address: URL;
    try {
      address = new URL(candidate, origin);
    } catch {
      continue;
    }
    address.hash = '';
    const url = address.href;
    if (wanted.includes(url) || !strategyFor({ method: 'GET', url }, origin)) continue;
    wanted.push(url);
    if (wanted.length >= FIRST_VISIT_LIMIT) break;
  }
  return wanted;
}

export async function startOffline(env: OfflineEnvironment): Promise<void> {
  const container = env.serviceWorker;
  if (!env.secure || !container) return;
  if (!env.enabled) {
    // Copies first: unregistering does not delete them, and a worker still running could keep serving them.
    await env.clearCopies().catch(() => undefined);
    const registrations = await container.getRegistrations().catch((): readonly WorkerRegistration[] => []);
    for (const registration of registrations) registration.unregister().catch(() => undefined);
    return;
  }
  const controlled = Boolean(container.controller);
  try {
    await container.register('/sw.js', { scope: '/' });
  } catch {
    return;
  }
  // A later visit is saved by the worker as it goes. But a new deploy's worker deletes the old worker's copies when it
  // takes over, including the page just opened, so that page is saved again once the new worker has control.
  if (controlled) {
    container.addEventListener('controllerchange', () => void saveThisVisit(env).catch(() => undefined), { once: true });
    return;
  }
  // The first visit was loaded before any worker could keep anything.
  await container.ready;
  if (!container.controller) {
    await Promise.race([
      new Promise<void>((resolve) => container.addEventListener('controllerchange', () => resolve(), { once: true })),
      env.wait(CONTROL_WAIT_MS),
    ]);
  }
  if (!container.controller) return;
  await saveThisVisit(env);
}

/** Fetches this page and the files it loaded through the worker, which keeps what its rules allow. */
async function saveThisVisit(env: OfflineEnvironment): Promise<void> {
  for (const url of firstVisitUrls(env.pageUrl, env.resources(), env.origin)) await env.fetchOne(url).catch(() => undefined);
}

if (typeof document !== 'undefined' && typeof navigator !== 'undefined') {
  const script = document.currentScript;
  const start = () => {
    startOffline({
      serviceWorker: navigator.serviceWorker as WorkerContainer | undefined,
      secure: window.isSecureContext,
      enabled: script instanceof HTMLScriptElement && script.dataset.offline === 'on',
      origin: location.origin,
      pageUrl: location.href,
      resources: () => performance.getEntriesByType('resource').map((entry) => entry.name),
      fetchOne: (url) => fetch(url),
      clearCopies: async () => {
        const ours = cacheName('x').slice(0, -1);
        for (const name of await caches.keys()) if (name.startsWith(ours)) await caches.delete(name);
      },
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    }).catch(() => undefined);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
