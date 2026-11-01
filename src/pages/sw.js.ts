/**
 * /sw.js, the offline service worker (ROADMAP Task 5), written when the site is built. It is a static file like any
 * other page: the browser fetches it from this site's own address, so the content security policy needs no change
 * (workers fall back to `script-src 'self'`). Its pieces are src/scripts/offlineplan.ts (what may be kept),
 * swlogic.ts (the decisions) and sw.ts (the worker's events); swbuild.ts joins them.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { APIRoute } from 'astro';
import offlineplan from '../scripts/offlineplan.ts?raw';
import swlogic from '../scripts/swlogic.ts?raw';
import worker from '../scripts/sw.ts?raw';
import { buildServiceWorker } from '../scripts/swbuild';

/** The deploy's commit when the build knows it (Cloudflare or GitHub), else git, else the time: a new one each build. */
function buildId(): string {
  const fromEnvironment = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromEnvironment && /^[0-9a-f]{7,64}$/i.test(fromEnvironment)) return fromEnvironment.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return Date.now().toString(36);
  }
}

const sources = [offlineplan, swlogic, worker];
// The text hash makes a change to the worker itself start a new cache even when the commit is unknown.
const version = `${buildId()}-${createHash('sha256').update(sources.join('\n')).digest('hex').slice(0, 8)}`;

export const GET: APIRoute = () =>
  new Response(buildServiceWorker(sources, version), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  });
