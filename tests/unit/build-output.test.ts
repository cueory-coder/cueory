/**
 * Checks the built site in dist/. Run `npm run build` first (CI does).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newsletter, site } from '../../src/config/site';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

const requiredPages = [
  'index.html',
  'learn/study-skills.html',
  'privacy.html',
  'terms.html',
  'disclaimer.html',
  'support.html',
  'subscribed.html',
];

describe.skipIf(!existsSync(dist))('built site', () => {
  const pages = htmlFiles(dist);

  it.each(requiredPages)('has %s', (page) => {
    expect(existsSync(join(dist, page))).toBe(true);
  });

  it.each(pages.map((p) => [p.replace(dist, '')]))('%s has a strict CSP and a language', (page) => {
    const html = readFileSync(join(dist, page), 'utf8');
    expect(html).toMatch(/<html lang="en"/);
    const csp = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)?.[1];
    expect(csp, 'missing CSP meta tag').toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it.each(pages.map((p) => [p.replace(dist, '')]))('%s: the CSP allows every inline script by hash', (page) => {
    const html = readFileSync(join(dist, page), 'utf8');
    const csp = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)![1];
    const scriptSrc = /script-src ([^;]+)/.exec(csp)![1];
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const body of inline) {
      const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
      expect(scriptSrc, `inline script not allowed: ${body.slice(0, 60)}`).toContain(hash);
    }
  });

  it.runIf(site.showBuildingNotice).each(pages.map((p) => [p.replace(dist, '')]))(
    '%s shows the building notice',
    (page) => {
      const html = readFileSync(join(dist, page), 'utf8');
      expect(html).toContain("We're still building. More coming soon.");
    },
  );

  it('keeps the signup thank-you page out of search engines', () => {
    const html = readFileSync(join(dist, 'subscribed.html'), 'utf8');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('home page signup matches the Kit settings, and the CSP allows only that form address', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const csp = /<meta http-equiv="content-security-policy" content="([^"]+)"/.exec(html)![1];
    const formAction = /form-action ([^;]+)/.exec(csp)![1].trim();
    if (newsletter.formAction) {
      expect(html).toContain(`action="${newsletter.formAction}"`);
      expect(html).toContain(`name="${newsletter.emailFieldName}"`);
      expect(formAction).toBe(`'self' ${new URL(newsletter.formAction).origin}`);
    } else {
      expect(html).toContain('Signups open soon.');
      expect(html).not.toContain('<form');
      expect(formAction).toBe("'self'");
    }
  });

  it('ships the security headers file', () => {
    const headers = readFileSync(join(dist, '_headers'), 'utf8');
    for (const h of [
      "frame-ancestors 'none'",
      'Strict-Transport-Security',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(headers).toContain(h);
    }
  });

  it('never ships secret-looking values', () => {
    const files = readdirSync(join(dist, '_astro')).map((f) => join(dist, '_astro', f));
    for (const f of [...pages.map((p) => p), ...files.filter((f) => f.endsWith('.js'))]) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/sb_secret_[A-Za-z0-9]/);
      expect(text, f).not.toMatch(/service_role/);
      expect(text, f).not.toMatch(/api_secret|kit_api_key/i);
    }
  });
});
