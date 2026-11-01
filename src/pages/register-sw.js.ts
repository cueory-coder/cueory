/**
 * /register-sw.js, the page side of the offline service worker (src/scripts/offline.ts), written when the site is
 * built. It is an external file on this site's own address, so pages carry no inline script for it and the content
 * security policy stays as it is.
 */
import type { APIRoute } from 'astro';
import offlineplan from '../scripts/offlineplan.ts?raw';
import offline from '../scripts/offline.ts?raw';
import swlogic from '../scripts/swlogic.ts?raw';
import { buildPlainScript } from '../scripts/swbuild';

const script = buildPlainScript([offlineplan, swlogic, offline]);

export const GET: APIRoute = () => new Response(script, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
