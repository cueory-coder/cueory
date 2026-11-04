/**
 * Stops `astro build` when this build's public account settings are wrong (Task 161, security audit item 2).
 *
 * PUBLIC_ variables are compiled into the browser bundle, so a secret key or a wrong project address in one would ship
 * to every visitor. At run time `supabaseSettings` only switches accounts off; this check makes the same mistakes a
 * build failure instead, before anything is bundled. It reuses the checks in `supabaseenv.ts`.
 *
 * Rule: both unset is fine (accounts are off). Only one set, or either one invalid, fails. Messages come from
 * `supabaseSettings` and fixed text only, so they never contain the value of either variable.
 */
import type { AstroIntegration } from 'astro';
import { supabaseSettings } from './supabaseenv';

type PublicEnv = Parameters<typeof supabaseSettings>[0];

const isSet = (value: string | undefined): boolean => value !== undefined && value.trim() !== '';

/** Returns null when the build may go ahead, or a reason it must stop (never containing either value). */
export function supabaseBuildProblem(env: PublicEnv): string | null {
  const hasUrl = isSet(env.PUBLIC_SUPABASE_URL);
  const hasKey = isSet(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!hasUrl && !hasKey) return null;

  const settings = supabaseSettings(env);
  if (settings.enabled) return null;
  // A secret key or legacy JWT is reported first, even when the address is missing.
  if (settings.reason.startsWith('accounts are misconfigured')) return settings.reason;
  if (!hasUrl) return 'accounts are misconfigured: PUBLIC_SUPABASE_PUBLISHABLE_KEY is set but PUBLIC_SUPABASE_URL is not; set both or neither';
  return 'accounts are misconfigured: PUBLIC_SUPABASE_URL is set but PUBLIC_SUPABASE_PUBLISHABLE_KEY is not; set both or neither';
}

/** Throws a clear error when the settings would bundle something wrong. This is what the build runs. */
export function assertSupabaseBuildSettings(env: PublicEnv): void {
  const problem = supabaseBuildProblem(env);
  if (problem !== null) {
    throw new Error(
      `Build stopped: ${problem}. Fix PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY in this build's ` +
        'settings, or remove both to build with accounts off.',
    );
  }
}

/** Astro integration: runs the check when the build starts. `astro dev` only warns, since accounts stay off there. */
export function supabaseBuildCheck(env: PublicEnv): AstroIntegration {
  return {
    name: 'cueory:supabase-build-check',
    hooks: {
      'astro:config:setup': ({ command, logger }) => {
        if (command === 'build') {
          assertSupabaseBuildSettings(env);
          return;
        }
        const problem = supabaseBuildProblem(env);
        if (problem !== null) logger.warn(`${problem}. Accounts are off until it is fixed.`);
      },
    },
  };
}
