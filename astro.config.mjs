// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { newsletter, site } from './src/config/site.ts';
import { themeHeadScript } from './src/scripts/theme.ts';
import { connectSrc } from './src/islands/supabasecsp.ts';
import { loadEnv } from 'vite';
import { pruneDraftModelsIntegration } from './src/visuals/prunedrafts.ts';

// The signup form posts to Kit, so the CSP must allow that one address.
const formOrigin = newsletter.formAction ? ` ${new URL(newsletter.formAction).origin}` : '';

// Astro doesn't hash hand-written inline scripts, so allow the theme script by its exact hash.
/** @type {`sha256-${string}`} */
const themeHeadScriptHash = `sha256-${createHash('sha256').update(themeHeadScript).digest('base64')}`;

// Account settings for this build (D-73): Cloudflare Workers Builds sets them as build variables; local builds and CI
// have none, so accounts stay off and connect-src is unchanged. Only PUBLIC_ variables are read.
const publicEnv = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');

// https://astro.build/config
export default defineConfig({
  site: site.url,
  output: 'static',
  trailingSlash: 'never',

  integrations: [react(), pruneDraftModelsIntegration()],

  build: {
    // Keep CSS in files so the content security policy can stay strict.
    inlineStylesheets: 'never',
    // privacy.html is served at /privacy, matching trailingSlash: 'never'.
    format: 'file',
  },

  // Astro adds a per-page Content-Security-Policy <meta> with hashes of its own
  // scripts and styles. Headers that can't go in a <meta> live in public/_headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        // Cloudflare Web Analytics beacon, plus this build's one Supabase project when accounts are on (Task 55).
        connectSrc(publicEnv),
        // Lesson videos load from YouTube's cookie-free domain only (D-82).
        "frame-src https://www.youtube-nocookie.com",
        "object-src 'none'",
        "base-uri 'self'",
        `form-action 'self'${formOrigin}`,
      ],
      scriptDirective: {
        // 'wasm-unsafe-eval' lets site search (Pagefind) compile its WebAssembly. It allows WebAssembly only, never
        // JavaScript eval, and scripts still come only from this site (D-49).
        resources: ["'self'", "'wasm-unsafe-eval'", 'https://static.cloudflareinsights.com'],
        hashes: [themeHeadScriptHash],
      },
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
