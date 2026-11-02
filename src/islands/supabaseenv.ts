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
 * - https protocol (not http), or http only for localhost / 127.0.0.1
 * - no embedded credentials (username or password)
 * - no port (only a local address keeps its port)
 * - a single subdomain under supabase.co with a 20-char lowercase alphanum ref
 * - no path, query string or fragment
 * Exported so the batch importer (scripts/import_batch.ts) checks a project address exactly the same way.
 */
export function validateUrl(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null;
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  // Credentials are never valid in a project URL.
  if (parsed.username !== '' || parsed.password !== '') return null;
  // Allow http only for local Supabase (localhost / 127.0.0.1).
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (isLocal) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  }
  if (parsed.protocol !== 'https:') return null;
  // A hosted project address never has a port (local ones above keep theirs).
  if (parsed.port !== '') return null;
  if (!parsed.hostname.endsWith('.supabase.co')) return null;
  // Must be exactly <ref>.supabase.co — no deeper nesting.
  const parts = parsed.hostname.split('.');
  if (parts.length !== 3) return null;
  const ref = parts[0]!;
  // Supabase project refs are exactly 20 lowercase alphanumeric characters.
  if (!/^[a-z0-9]{20}$/.test(ref)) return null;
  // No path, query or hash beyond the root slash.
  if (parsed.pathname !== '/' && parsed.pathname !== '') return null;
  if (parsed.search !== '') return null;
  if (parsed.hash !== '') return null;
  return parsed.origin;
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
    let p: URL | undefined;
    try { p = new URL(rawUrl.trim()); } catch { /* fall through to generic error */ }
    if (p && (p.username !== '' || p.password !== '')) {
      return {
        enabled: false,
        reason: 'accounts are misconfigured: the project address must not include credentials',
      };
    }
    if (p && (p.hostname === 'localhost' || p.hostname === '127.0.0.1')) {
      return {
        enabled: false,
        reason: 'accounts are misconfigured: local Supabase must use http://localhost or http://127.0.0.1',
      };
    }
    if (rawUrl.trim().startsWith('http:')) {
      return {
        enabled: false,
        reason: 'accounts are misconfigured: the project address must use https, not http',
      };
    }
    if (p && p.pathname !== '/' && p.pathname !== '') {
      return {
        enabled: false,
        reason: 'accounts are misconfigured: the project address must be https://<ref>.supabase.co with no path',
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

  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(rawKey.trim())) {
    return {
      enabled: false,
      reason: 'accounts are misconfigured: the key does not look like a publishable key (expected sb_publishable_…)',
    };
  }

  return { enabled: true, url, key: rawKey.trim() };
}
