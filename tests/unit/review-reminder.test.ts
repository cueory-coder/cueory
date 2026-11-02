import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../emails/review-reminder.html', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../../src/pages/preview/email.astro', import.meta.url), 'utf8');

const fields = [
  'CARD_COUNT', 'MODULE_NAME', 'MINUTES', 'REVIEW_URL',
  'UNSUBSCRIBE_URL', 'PHYSICAL_ADDRESS',
] as const;

describe('review reminder source template (Task 106)', () => {
  it('is a complete, accessible email document with two presentation tables', () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).toMatch(/<h1\b[^>]*>{{CARD_COUNT}} cards are ready<\/h1>/);
    expect((html.match(/<table role="presentation"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('requires real substitution for every data or compliance field before sending', () => {
    for (const field of fields) {
      expect(html, field).toContain('{{' + field + '}}');
    }
    expect(html).toContain('validated + HTML-escaped substitutions');
    expect(html).toContain('Never send before opt-in');
    expect(html).toContain('unsubscribe from reminders');
    expect(html).toContain('you chose to receive study reminders');
  });

  it('contains a matching plain-text alternative without another email file', () => {
    const plain = /PLAIN_TEXT_ALTERNATIVE_START([\s\S]*?)PLAIN_TEXT_ALTERNATIVE_END/.exec(html)?.[1];
    expect(plain).toBeDefined();
    for (const field of fields) expect(plain, field).toContain('{{' + field + '}}');
    expect(plain).toContain('a few cards are ready for another look');
    expect(preview).toContain('plain-text version');
  });

  it('uses approved light colors and fallbacks without loading external assets', () => {
    for (const color of ['#f9f5ef', '#3e2c23', '#d3b7a1', '#6b5243']) {
      expect(html.toLowerCase()).toContain(color);
    }
    expect(html).toMatch(/font-family:'Bodoni Moda',Georgia,'Times New Roman',serif/);
    expect(html).toMatch(/font-family:Lato,Arial,Helvetica,sans-serif/);
    expect(html).not.toMatch(/<(?:script|img|iframe|link|form)\b/i);
    expect(html).not.toMatch(/(?:https?:)?\/\/[^{} \n"'<>]+/);
    expect(html).not.toMatch(/(?:utm_|fbclid=|gclid=|onclick=)/i);
  });

  it('uses only a review link and an unsubscribe link, with no tracking URLs', () => {
    const links = [...html.matchAll(/<a\s+href="([^"]+)"/g)].map((match) => match[1]);
    expect(links).toEqual(['{{REVIEW_URL}}', '{{UNSUBSCRIBE_URL}}']);
    expect(html).toContain('{{PHYSICAL_ADDRESS}}');
  });

  it('keeps the preview unindexed, sample-only and without a sender', () => {
    expect(preview).toMatch(/<Layout[\s\S]*?\bnoindex\b/);
    expect(preview).toContain('promo={false}');
    expect(preview).toContain('this page does not send an email');
    expect(preview).toContain('data-testid="review-email-card"');
    expect(preview).not.toMatch(/\b(?:sendEmail|resend\.emails|fetch\()\b/);
  });
});
