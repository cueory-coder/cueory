/**
 * Registers the offline service worker (ROADMAP Task 5) once the page has finished loading, so it never competes with
 * the page itself. Only in a built site (not the dev server), only where the browser supports it and the page is
 * served securely, and a failure is silent: the site works the same without it.
 */
export function registerOffline(
  nav: { serviceWorker?: { register(url: string, options: { scope: string }): Promise<unknown> } },
  secure: boolean,
): Promise<unknown> | undefined {
  if (!secure || !nav.serviceWorker) return;
  return nav.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}

if (import.meta.env.PROD && typeof window !== 'undefined') {
  window.addEventListener('load', () => registerOffline(navigator, window.isSecureContext), { once: true });
}
