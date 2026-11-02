/**
 * The content security policy's `connect-src` (Task 55, D-73). Pure; used by astro.config.mjs at build time.
 *
 * The browser may talk to this site, Cloudflare Web Analytics and, only when this build has valid account settings,
 * exactly one Supabase project origin. Settings that `supabaseSettings` refuses add nothing.
 */
import { supabaseSettings, type SupabaseSettings } from './supabaseenv';

export const BASE_CONNECT_SRC = "connect-src 'self' https://cloudflareinsights.com" as const;
export type ConnectSrc = `connect-src ${string}`;

export function connectSrc(env: Parameters<typeof supabaseSettings>[0]): ConnectSrc {
  const settings: SupabaseSettings = supabaseSettings(env);
  if (!settings.enabled) return BASE_CONNECT_SRC;
  return `${BASE_CONNECT_SRC} ${new URL(settings.url).origin}`;
}
