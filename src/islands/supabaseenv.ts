/**
 * Reads Supabase project settings from the build environment (D-73, "Keys per environment").
 * Pure logic: no network calls, no package imports, no DOM. Safe to unit-test directly.
 *
 * Only the PUBLIC_ variables are ever read here. A secret key or legacy JWT that lands in a
 * PUBLIC_ variable is refused with a clear reason — never echoed — so it is caught early.
 */

export interface SupabaseEnabled {
  enabled: true;
  url: string;
  key: string;
}

export interface SupabaseDisabled {
  enabled: false;
  reason: string;
}

export type SupabaseSettings = SupabaseEnabled | SupabaseDisabled;

/**
 * A valid project address is exactly `https://<project-ref>.supabase.co` with:
 * - https protocol (not http)
 * - a single subdomain under supabase.co (no extra path, query string or fragment)
 * - a non-empty project ref that is a valid subdomain label
 */
function validateUrl(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null;
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.endsWith('.supabase.co')) return null;
  // Must be exactly <ref>.supabase.co — no deeper nesting.
  const parts = parsed.hostname.split('.');
  if (parts.length !== 3) return null;
  const ref = parts[0]!;
  if (ref === '') return null;
  // No path, query or hash beyond the root slash.
  if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
  if (parsed.search !== '') return null;
  if (parsed.hash !== '') return null;
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Returns `{ enabled: true, url, key }` when both variables are present and valid.
 * Returns `{ enabled: false, reason }` otherwise — reason is suitable to log but
 * never includes the key value itself.
 */
export function supabaseSettings(env: {
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}): SupabaseSettings {
  const rawUrl = env.PUBLIC_SUPABASE_URL;
  const rawKey = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // ── Secret / legacy key guard ─────────────────────────────────────────────
  // Check before anything else so a misconfigured build fails loudly.
  if (rawKey !== undefined && rawKey.trim() !== '') {
    if (rawKey.trimStart().startsWith('sb_secret_')) {
      return {
        enabled: false,
        reason:
          'accounts are misconfigured: a secret key must never go in a PUBLIC_ variable; use the publishable key instead',
      };
    }
    if (rawKey.trimStart().startsWith('eyJ')) {
      return {
        enabled: false,
        reason:
          'accounts are misconfigured: a legacy JWT (anon key) must never go in a PUBLIC_ variable; use the publishable key instead',
      };
    }
  }

  // ── URL ───────────────────────────────────────────────────────────────────
  if (!rawUrl || rawUrl.trim() === '') {
    return { enabled: false, reason: 'accounts are off in this build: no project address' };
  }

  const url = validateUrl(rawUrl);
  if (url === null) {
    if (rawUrl.trim().startsWith('http:')) {
      return {
        enabled: false,
        reason: 'accounts are misconfigured: the project address must use https, not http',
      };
    }
    const hasPath = (() => {
      try {
        const p = new URL(rawUrl.trim());
        return p.pathname !== '/' && p.pathname !== '';
      } catch {
        return false;
      }
    })();
    if (hasPath) {
      return {
        enabled: false,
        reason:
          'accounts are misconfigured: the project address must be https://<ref>.supabase.co with no path',
      };
    }
    return {
      enabled: false,
      reason: 'accounts are misconfigured: the project address is not a valid https://<ref>.supabase.co address',
    };
  }

  // ── Key ───────────────────────────────────────────────────────────────────
  if (!rawKey || rawKey.trim() === '') {
    return { enabled: false, reason: 'accounts are off in this build: no publishable key' };
  }

  if (!rawKey.trim().startsWith('sb_publishable_')) {
    return {
      enabled: false,
      reason: 'accounts are misconfigured: the key does not look like a publishable key (expected sb_publishable_…)',
    };
  }

  return { enabled: true, url, key: rawKey.trim() };
}
