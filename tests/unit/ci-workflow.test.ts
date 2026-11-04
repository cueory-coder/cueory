import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REQUIRED_CHECKS } from '../../scripts/automerge/decide';

/** Task 308: the browser tests run in parts, and one check still stands for all of CI's build and test work. */
const yml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

/** The text of one job, from its key to the next job's key. */
function job(id: string): string {
  const start = yml.indexOf(`\n  ${id}:\n`);
  expect(start, `job ${id}`).toBeGreaterThan(-1);
  const next = yml.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return next === -1 ? yml.slice(start) : yml.slice(start, start + 1 + next);
}

describe('CI workflow', () => {
  it('keeps the required check name on the job that waits for every part', () => {
    expect(REQUIRED_CHECKS).toContain('Type check, build and test');
    const verify = job('verify');
    expect(verify).toContain('name: Type check, build and test');
    expect(verify).toContain('needs: [checks, browser]');
    // It must run (and fail) when a part failed, so it can't use the default success() condition.
    expect(verify).toContain('!cancelled()');
    expect(verify).toContain('if [ "$CHECKS" != "success" ]; then');
    expect(verify).toContain('if [ "$BROWSER" != "success" ]; then');
    // Browser tests may be skipped only for a Markdown-only pull request.
    expect(verify).toContain('if [ "$DOCS_ONLY" = "true" ] && [ "$BROWSER" = "skipped" ]; then exit 0; fi');
  });

  it('runs every part of the browser tests, each with its own time limit', () => {
    const browser = job('browser');
    expect(browser).toContain('needs: checks');
    expect(browser).toMatch(/timeout-minutes: \d+/);
    expect(browser).toContain('fail-fast: false');
    expect(browser).toContain('SHARDS: ${{ strategy.job-total }}');
    // Both branches of the project choice run only this part.
    expect(browser.match(/--shard="\$SHARD\/\$SHARDS"/g)).toHaveLength(2);
  });

  it('gives no job more than read access and pins every action to a full commit SHA', () => {
    expect(yml.match(/permissions:/g)).toHaveLength(1);
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    for (const use of yml.match(/uses: \S+/g) ?? []) expect(use).toMatch(/@[0-9a-f]{40}$/);
  });
});
