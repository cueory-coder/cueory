import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

const config = vi.hoisted(() => ({ formAction: '', emailFieldName: 'email_address', provider: 'Kit' }));
vi.mock('../../src/config/site', async (original) => ({
  ...await original<typeof import('../../src/config/site')>(), newsletter: config,
}));
import ResultSignup from '../../src/islands/ResultSignup';

afterEach(() => { config.formAction = ''; });

describe('finish-screen reuse of the plain Kit form', () => {
  it('does not collect an email or offer a submit action before the existing form is configured', () => {
    const html = renderToStaticMarkup(createElement(ResultSignup));
    expect(html).toContain('signups open soon.');
    expect(html).not.toMatch(/<form|<input|<script/);
  });

  it('keeps the existing form method, config fields, native validation and privacy explanation', () => {
    config.formAction = 'https://newsletter.example.test/subscribe';
    const html = renderToStaticMarkup(createElement(ResultSignup));
    const existing = readFileSync(new URL('../../src/components/SignupForm.astro', import.meta.url), 'utf8');
    expect(existing).toContain('action={newsletter.formAction}');
    expect(existing).toContain('name={newsletter.emailFieldName}');
    for (const contract of ['method="post"', 'type="email"', 'maxlength="254"', 'autocomplete="email"', 'inputmode="email"', 'href="/privacy"']) {
      expect(existing).toContain(contract);
      expect(html.toLowerCase()).toContain(contract);
    }
    expect(html).toContain('action="https://newsletter.example.test/subscribe"');
    expect(html).toContain('name="email_address"');
    expect(html).toContain('required=""');
    expect(html).toContain('for="result-signup-email"');
    expect(html).toContain('aria-describedby="result-signup-email-help"');
    expect(html).toContain('id="result-signup-email-help"');
    expect(html).toContain('emails are sent by Kit;');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('signup-pending');
  });
});
