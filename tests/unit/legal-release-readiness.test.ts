/**
 * Release-only safety check: production legal copy must not be a draft.
 *
 * Staging can intentionally contain draft copy while the founder reviews it.
 * On a PR into main, a push to main, or an explicit audit, block the release rather than
 * silently publishing the placeholder Terms, Disclaimer, or Privacy Policy.
 * This never changes legal text or authorizes deployment.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Environment = Record<string, string | undefined>;

function shouldAuditLegalCopy(env: Environment): boolean {
  return env.CUEORY_LEGAL_RELEASE_AUDIT === '1'
    || (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'main')
    || (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main');
}

const rendered = (file: string) =>
  readFileSync(new URL(`../../dist/${file}`, import.meta.url), 'utf8');
const source = (file: string) =>
  readFileSync(new URL(`../../src/pages/${file}.astro`, import.meta.url), 'utf8');

describe('legal release check selection', () => {
  it('checks main release PRs, direct main pushes and manual audits without blocking staging', () => {
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' })).toBe(true);
    expect(shouldAuditLegalCopy({ CUEORY_LEGAL_RELEASE_AUDIT: '1' })).toBe(true);
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'staging' })).toBe(false);
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' })).toBe(true);
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/staging' })).toBe(false);
    expect(shouldAuditLegalCopy({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main-fix' })).toBe(false);
  });

  it('does not skip main release checks when a PR changes only Markdown', () => {
    // This protects the release gate from the CI docs-only optimization.
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('if [ "$GITHUB_BASE_REF" != "main" ] && [ -n "$files" ]');
  });
});


describe('Cloudflare Workers Builds release gate', () => {
  const script = new URL('../../scripts/check-legal-release.mjs', import.meta.url);
  const run = (overrides: Record<string, string>) => {
    return spawnSync(process.execPath, [fileURLToPath(script)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: '',
        GITHUB_BASE_REF: '',
        GITHUB_REF: '',
        WORKERS_CI: '',
        WORKERS_CI_BRANCH: '',
        CUEORY_LEGAL_RELEASE_AUDIT: '',
        ...overrides,
      },
    });
  };

  it('runs automatically before the Workers build rather than relying on GitHub CI', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(packageJson.scripts.prebuild).toBe('node scripts/check-legal-release.mjs');
  });

  it('blocks main auto-deploys when legal sources contain known draft markers', () => {
    const hasDraftCopy = ['terms', 'disclaimer', 'privacy'].some((page) =>
      /<PlaceholderBlock\b|Draft for review|Last updated:\s*not yet published/i
        .test(source(page)));
    const main = run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' });
    expect(main.status).toBe(hasDraftCopy ? 1 : 0);
    if (hasDraftCopy) expect(main.stderr).toContain('legal release blocked:');
    expect(run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }).status).toBe(0);
    expect(run({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'staging' }).status).toBe(0);
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
