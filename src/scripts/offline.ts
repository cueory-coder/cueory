/**
 * The page side of the offline service worker (ROADMAP Task 5), served as the external file /register-sw.js by
 * src/pages/register-sw.js.ts (so no inline script, and no change to the content security policy) and loaded after the
 * page has parsed. It registers /sw.js once the page has finished loading, so it never competes with the page itself.
 * Only in a built site, only where the browser supports workers and the page is secure. When `offline.enabled` is false
 * (src/config/site.ts), it removes old copies and registrations. Keep this free of syntax the build cannot strip.
 */
import { cacheName } from './offlineplan';
import { storable, strategyFor, type ResponseLike } from './swlogic';

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
export interface StorageEstimateLike {
  usage?: number;
  quota?: number;
}

/** These are readable outcomes, not a promise that every page is available offline. */
export type OfflineState = 'off' | 'turning-off' | 'not-supported' | 'saving' | 'ready' | 'storage-full' | 'unavailable';

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
  /** Optional browser-provided storage estimate. A missing or blocked estimate is not proof of available space. */
  storageEstimate?: () => Promise<StorageEstimateLike | undefined>;
  /** Gives a caller or a screen-reader status region every distinct state. */
  onState?: (state: OfflineState) => void;
}

/** The most addresses fetched to save a first visit. */
const FIRST_VISIT_LIMIT = 60;
/** How long a first visit waits for the new worker to take control of the page. */
const CONTROL_WAIT_MS = 3000;

/** Which state to show while the browser's support and switch setting are checked. */
export function offlineStartState(enabled: boolean, secure: boolean, supported: boolean): OfflineState {
  if (!enabled) return secure && supported ? 'turning-off' : 'off';
  return secure && supported ? 'saving' : 'not-supported';
}

/** A successful visit is ready only after every requested copy has finished without a known error. */
export function offlineProgressState(completed: number, total: number, failed: boolean): OfflineState {
  if (failed || !Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(completed)
    || completed < 0 || completed > total) {
    return 'unavailable';
  }
  return completed < total ? 'saving' : 'ready';
}

/** A quota estimate is a hint, never a reason to claim success or to guess that space is full. */
export function offlineStorageFull(estimate: StorageEstimateLike | undefined): boolean {
  if (!estimate) return false;
  const { usage, quota } = estimate;
  return typeof usage === 'number' && typeof quota === 'number' && Number.isFinite(usage)
    && Number.isFinite(quota) && quota > 0 && usage >= quota;
}

/** A network or registration failure is not the same as a proven full disk. */
export function offlineFailureState(error: unknown, estimate?: StorageEstimateLike): OfflineState {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || offlineStorageFull(estimate)
    ? 'storage-full'
    : 'unavailable';
}

/** Turning off is complete only after the storage and registration cleanup have finished. */
export function offlineOffState(cleaned: boolean): OfflineState {
  return cleaned ? 'off' : 'unavailable';
}

/** Plain messages: status is always given in words rather than by color or motion. */
export function offlineStateText(state: OfflineState): string {
  switch (state) {
    case 'off': return 'offline study is off.';
    case 'turning-off': return 'turning off offline study…';
    case 'not-supported': return 'offline study is not supported on this browser.';
    case 'saving': return 'saving lessons for offline study…';
    case 'ready': return 'offline study is on and ready for saved lessons.';
    case 'storage-full': return 'device storage is full. lessons cannot be saved offline.';
    case 'unavailable': return 'offline study could not finish. please try again while online.';
  }
}

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

/** Failed or unavailable estimates are ignored. They do not prove a disk is full. */
async function safeEstimate(env: OfflineEnvironment): Promise<StorageEstimateLike | undefined> {
  try {
    return await env.storageEstimate?.();
  } catch {
    return undefined;
  }
}

/** Report no duplicate announcements for a single activation. */
function statusReporter(env: OfflineEnvironment): (state: OfflineState) => void {
  let previous: OfflineState | undefined;
  return (state) => {
    if (state === previous) return;
    previous = state;
    try {
      env.onState?.(state);
    } catch {
      // Announcing a status must never prevent an attempted cleanup or save.
    }
  };
}

export async function startOffline(env: OfflineEnvironment): Promise<void> {
  const container = env.serviceWorker;
  const report = statusReporter(env);
  const supported = Boolean(container && typeof container.register === 'function' && typeof container.addEventListener === 'function');
  const initial = offlineStartState(env.enabled, env.secure, supported);
  report(initial);

  if (!env.enabled) {
    if (!env.secure || !container) return;
    // Copies first: unregistering does not delete them. Wait for both operations before saying "off".
    let cleaned = true;
    try {
      await env.clearCopies();
    } catch {
      cleaned = false;
    }
    try {
      const registrations = await container.getRegistrations();
      for (const registration of registrations) {
        try {
          if (!await registration.unregister()) cleaned = false;
        } catch {
          cleaned = false;
        }
      }
    } catch {
      cleaned = false;
    }
    report(offlineOffState(cleaned));
    return;
  }
  if (initial === 'not-supported' || !container) return;

  const controlled = Boolean(container.controller);
  try {
    await container.register('/sw.js', { scope: '/' });
  } catch (error) {
    report(offlineFailureState(error, await safeEstimate(env)));
    return;
  }

  // Later visits are saved by the worker itself. A new deploy deletes the old copies after taking control, so save
  // the current visit again at that point. A working controller does not prove that every lesson is stored offline.
  if (controlled) {
    report('ready');
    container.addEventListener('controllerchange', () => {
      report('saving');
      void saveThisVisit(env, report).catch(() => report('unavailable'));
    }, { once: true });
    return;
  }

  // The first visit happened before a worker controlled this page. Installation can take over 3 seconds.
  // Only controllerchange has a timeout: waiting for ready never blocks the already-loaded page.
  try {
    await container.ready;
    if (!container.controller) {
      await Promise.race([
        new Promise<void>((resolve) => container.addEventListener('controllerchange', resolve, { once: true })),
        env.wait(CONTROL_WAIT_MS),
      ]);
    }
  } catch {
    report('unavailable');
    return;
  }
  if (!container.controller) {
    report('unavailable');
    return;
  }
  await saveThisVisit(env, report);
}

/** A missing/malformed response must not turn a failed offline copy into a false "ready" state. */
export function offlineFetchSaved(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ResponseLike>;
  if (typeof result.ok !== 'boolean' || typeof result.status !== 'number'
    || typeof result.type !== 'string' || typeof result.redirected !== 'boolean'
    || typeof result.headers?.get !== 'function') return false;
  try {
    return storable(result as ResponseLike);
  } catch {
    return false;
  }
}

/** Fetches this visit's public addresses through the worker. A partial failure never reports "ready". */
async function saveThisVisit(env: OfflineEnvironment, report: (state: OfflineState) => void): Promise<void> {
  const estimate = await safeEstimate(env);
  if (offlineStorageFull(estimate)) {
    report('storage-full');
    return;
  }
  let urls: string[];
  try {
    urls = firstVisitUrls(env.pageUrl, env.resources(), env.origin);
  } catch {
    report('unavailable');
    return;
  }
  let failed = false;
  for (let i = 0; i < urls.length; i += 1) {
    try {
      const result = await env.fetchOne(urls[i]!);
      // fetch() also resolves for HTTP errors. Only a complete cacheable response counts as saved.
      if (!offlineFetchSaved(result)) failed = true;
    } catch (error) {
      const failure = offlineFailureState(error, await safeEstimate(env));
      if (failure === 'storage-full') {
        report(failure);
        return;
      }
      failed = true;
    }
    // A completed final fetch is not yet a complete save: check storage first.
    // Otherwise we could briefly announce ready before discovering a full quota.
    if (i + 1 < urls.length) report(offlineProgressState(i + 1, urls.length, failed));
  }
  if (!failed && offlineStorageFull(await safeEstimate(env))) {
    report('storage-full');
    return;
  }
  report(offlineProgressState(urls.length, urls.length, failed));
}

/** Readable and screen-reader-announced state without modifying the shared layout or adding inline styles. */
export function renderOfflineState(state: OfflineState): void {
  const footer = document.querySelector('[data-site-footer]');
  if (!footer) return;
  let output = footer.querySelector<HTMLElement>('[data-offline-status]');
  if (!output) {
    output = document.createElement('p');
    output.className = 'mx-auto w-full max-w-page px-gutter py-2 text-center text-sm text-ink-soft';
    output.setAttribute('role', 'status');
    output.setAttribute('aria-live', 'polite');
    output.setAttribute('aria-atomic', 'true');
    footer.append(output);
  }
  output.dataset.offlineStatus = state;
  output.textContent = offlineStateText(state);
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
        for (const name of await caches.keys()) {
          if (name.startsWith(ours) && !await caches.delete(name)) throw new Error('Offline cache could not be deleted.');
        }
      },
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      storageEstimate: () => navigator.storage?.estimate() ?? Promise.resolve(undefined),
    }).catch(() => undefined);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
