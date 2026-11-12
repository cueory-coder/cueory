import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const source = readFileSync(new URL('../../src/pages/support.astro', import.meta.url), 'utf8');
const anchorTags = [...source.matchAll(/<a\b[\s\S]*?<\/a>/g)].map(([tag]) => tag);

describe('support page link and copy safeguards', () => {
  it('uses one outside link, sourced only from site.ts', () => {
    expect(source).toContain("import { site } from '../config/site'");
    expect(anchorTags).toHaveLength(1);
    expect(anchorTags[0]).toContain('href={site.tipPageUrl}');
    expect(source).not.toMatch(/\bhref\s*=\s*["']https?:\/\//i);
  });

  it('accepts an HTTPS tip URL or the documented empty setting, never an unsafe destination', () => {
    expect(typeof site.tipPageUrl).toBe('string');
    if (site.tipPageUrl === '') {
      expect(source).toContain('the support link is not available yet.');
    } else {
      const url = new URL(site.tipPageUrl);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).not.toBe('');
      expect(url.username).toBe('');
      expect(url.password).toBe('');
    }
  });

  it('protects the outside link against reverse tabnabbing', () => {
    expect(anchorTags[0]).toContain('target="_blank"');
    expect(anchorTags[0]).toMatch(/\brel="(?=[^"]*\bnoopener\b)(?=[^"]*\bnoreferrer\b)[^"]+"/);
    expect(anchorTags[0]).toContain('min-h-11');
    expect(anchorTags[0]).toContain('opens in a new tab');
  });

  it('shows a clear unavailable state when the configured link is empty', () => {
    expect(source).toMatch(/site\.tipPageUrl\s*\?\s*\(/);
    expect(source).toContain('the support link is not available yet.');
  });

  it('preserves Christian-approved mission lines and makes no new claims', () => {
    expect(source).toContain("'to make studying for nursing school simpler.'");
    expect(source).toContain(
      "'to give nursing students the materials they need to succeed and become great nurses at an affordable price.'",
    );
    expect(source).toContain('how your support helps');
    expect(source).not.toMatch(/\b(?:dollars|donate now|subscribe now|guaranteed)\b/i);
  });
});
