/**
 * Where the importer may write, and with which key (Task 139). Pure: reads only the values it is given.
 *
 * The project address and the secret key come only from environment variables (SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY), never from a file or an argument, so the key never lands in the repository or the
 * shell history. Supabase's secret keys (`sb_secret_…`) act as the service_role and bypass row-level security
 * (Supabase docs, "API keys"); D-73 retired the legacy JWT keys, so those are refused. No message here ever contains
 * the key.
 */
import { validateUrl } from '../../src/islands/supabaseenv.ts';

export type Project = 'staging' | 'prod';
export const PROJECTS: readonly Project[] = ['staging', 'prod'];
export const PROJECT_NAMES: Record<Project, string> = { staging: 'cueory-staging', prod: 'cueory-prod' };

export interface Connection { project: Project; url: string; key: string }
export type ConnectionResult = { ok: true; connection: Connection } | { ok: false; reason: string };

export function connectionFrom(env: Record<string, string | undefined>, project: string | undefined): ConnectionResult {
  if (project === undefined) {
    return { ok: false, reason: 'say which project to use: add --project staging or --project prod.' };
  }
  if (!(PROJECTS as readonly string[]).includes(project)) {
    return { ok: false, reason: '--project must be staging or prod.' };
  }
  const rawUrl = env.SUPABASE_URL?.trim() ?? '';
  if (rawUrl === '') {
    return { ok: false, reason: 'SUPABASE_URL is not set. Set it to the project address, https://<project ref>.supabase.co (docs/BATCHES.md, "Importing a passed batch").' };
  }
  const url = validateUrl(rawUrl);
  if (url === null || !url.startsWith('https://')) {
    return { ok: false, reason: 'SUPABASE_URL must be the hosted project address, exactly https://<project ref>.supabase.co with nothing after it.' };
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (key === '') {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY is not set. Set it to the project\'s secret key for this one Terminal window (docs/BATCHES.md, "Importing a passed batch").' };
  }
  if (key.startsWith('sb_publishable_')) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY holds the publishable key, which can\'t write. Use the secret key (sb_secret_…) from Settings > API Keys.' };
  }
  if (key.startsWith('eyJ')) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY holds a legacy JWT key, which Cueory does not use (D-73). Use the secret key (sb_secret_…) from Settings > API Keys.' };
  }
  if (!/^sb_secret_[A-Za-z0-9_-]{8,}$/.test(key)) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY does not look like a secret key (it should start with sb_secret_ and have no spaces).' };
  }
  return { ok: true, connection: { project: project as Project, url, key } };
}

/**
 * Hides every secret in a line of output: the exact key values given, and anything shaped like a Supabase secret or
 * legacy key, in case a library ever echoes one back in an error.
 */
export function redactor(secrets: (string | undefined)[]): (text: string) => string {
  const exact = secrets.map(s => s?.trim() ?? '').filter(s => s.length >= 8).sort((a, b) => b.length - a.length);
  return (text: string) => {
    let out = text;
    for (const secret of exact) out = out.split(secret).join('[hidden]');
    return out
      .replace(/sb_secret_[A-Za-z0-9_-]*/g, '[hidden]')
      .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[hidden]');
  };
}
