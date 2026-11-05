/**
 * Release-only safety check: production legal copy must not be a draft.
 *
 * Staging can intentionally contain draft copy while the founder reviews it.
 * On a PR into main (or an explicit audit), block the release rather than
 * silently publishing the placeholder Terms, Disclaimer, or Privacy Policy.
 * This never changes legal text or authorizes deployment.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Environment = Record<string, string | undefined>;

function shouldAuditLegalCopy(env: Environment): boolean {
  return env.CUEORY_LEGAL_RELEASE_AUDIT === '1'
    || (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'main');
}

const rendered = (file: string) =>
  readFileSync(new URL(`../../dist/${file}`, import.meta.url), 'utf8');
const source = (file: string) =>
  readFileSync(new URL(`../../src/pages/${file}.astro`, import.meta.url), 'utf8');

describe('legal release check selection', () => {
  it('checks main release PRs and manual audits but never automatically blocks staging PRs', () => {
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' })).toBe(true);
    expect(shouldAuditLegalCopy({ CUEORY_LEGAL_RELEASE_AUDIT: '1' })).toBe(true);
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'staging' })).toBe(false);
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'main' })).toBe(false);
  });
});

describe.skipIf(!shouldAuditLegalCopy(process.env))('legal pages ready for a main release', () => {
  it('contains approved Terms of Use instead of instructions to paste terms', () => {
    expect(source('terms')).not.toMatch(/<PlaceholderBlock\b/i);
    expect(rendered('terms.html')).not.toMatch(/Christian:\s*paste your terms of use here/i);
  });

  it('contains an approved educational disclaimer instead of placeholder instructions', () => {
    expect(source('disclaimer')).not.toMatch(/<PlaceholderBlock\b/i);
    expect(rendered('disclaimer.html')).not.toMatch(/Christian:\s*paste your disclaimer here/i);
  });

  it('contains a published, dated Privacy Policy instead of a draft', () => {
    expect(rendered('privacy.html')).not.toMatch(/Draft for review|Last updated:\s*not yet published/i);
  });
});
