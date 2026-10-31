// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { newsletter, site } from './src/config/site.ts';
import { themeHeadScript } from './src/scripts/theme.ts';

// The signup form posts to Kit, so the CSP must allow that one address.
const formOrigin = newsletter.formAction ? ` ${new URL(newsletter.formAction).origin}` : '';

// Astro doesn't hash hand-written inline scripts, so allow the theme script by its exact hash.
/** @type {`sha256-${string}`} */
const themeHeadScriptHash = `sha256-${createHash('sha256').update(themeHeadScript).digest('base64')}`;

// https://astro.build/config
export default defineConfig({
  site: site.url,
  output: 'static',
  trailingSlash: 'never',

  integrations: [react()],

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
        // Cloudflare Web Analytics beacon.
        "connect-src 'self' https://cloudflareinsights.com",
        "object-src 'none'",
        "base-uri 'self'",
        `form-action 'self'${formOrigin}`,
      ],
      scriptDirective: {
        resources: ["'self'", 'https://static.cloudflareinsights.com'],
        hashes: [themeHeadScriptHash],
      },
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
