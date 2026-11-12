import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { footerLinks, menuLinks, site } from '../../src/config/site';
import { indexablePages } from '../../src/config/routes';

const pageSource = readFileSync(new URL('../../src/pages/message.astro', import.meta.url), 'utf8');

describe('message page shell', () => {
  it('uses the shared marketing layout and keeps the page out of search results', () => {
    expect(pageSource).toContain("import Layout from '../layouts/Layout.astro'");
    expect(pageSource).toMatch(/<Layout\b[\s\S]*?\bnoindex\b/);
    expect(pageSource).toContain('title="message us"');
    expect(pageSource).toContain('class="veil');
  });

  it('does not add a working form, fields, submit controls or scripts', () => {
    expect(pageSource).not.toMatch(/<\s*\/?\s*(?:form|input|select|textarea|button|script)\b/i);
    expect(pageSource).not.toMatch(/\b(?:action|method)\s*=/i);
    expect(pageSource).toContain('coming soon');
  });

  it('uses the configured email address for the only contact link', () => {
    expect(pageSource).toContain("import { site } from '../config/site'");
    expect(pageSource).toContain('href={`mailto:${site.contactEmail}`}');
    expect(pageSource).toContain('email {site.contactEmail}');
    expect(pageSource).not.toContain(site.contactEmail);
    expect(pageSource.match(/mailto:/g)).toHaveLength(1);
  });

  it('is not added to the menu, footer links or public sitemap', () => {
    expect([...menuLinks, ...footerLinks].some((link) => link.href === '/message')).toBe(false);
    expect(indexablePages).not.toContain('/message');
  });

  it('explains the page-level flag and leaves founder copy for review', () => {
    expect(pageSource).toContain('flag or comment on a page');
    expect(pageSource).toContain('PATIENT_INFO_WARNING');
    expect(pageSource).toContain('[Christian writes this]');
  });
});
