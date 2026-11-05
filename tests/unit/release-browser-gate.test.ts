import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const verify = /^  verify:\n([\s\S]*?)(?=^  engines:\n)/m.exec(workflow)?.[1];
if (!verify) throw new Error('CI must contain a verify job before the optional engines job');

const shellBlock = /^        run: \|\n((?:          .*(?:\n|$))*)/m.exec(verify)?.[1];
if (!shellBlock) throw new Error('Cannot inspect the aggregate verification shell script');
const shell = shellBlock.split('\n').map((line) => line.startsWith('          ') ? line.slice(10) : line).join('\n');

function runGate(variables: Record<string, string> = {}) {
  return spawnSync('bash', ['-e', '-c', shell], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CHECKS: 'success',
      BROWSER: 'success',
      ENGINES: 'success',
      DOCS_ONLY: 'false',
      MAIN_RELEASE_PR: 'true',
      ...variables,
    },
  });
}

describe('required Safari and Firefox release checks', () => {
  it('waits for every browser engine and checks only main release PRs', () => {
    expect(verify).toContain('needs: [checks, browser, engines]');
    expect(verify).toContain('needs.engines.result');
    expect(verify).toContain("github.base_ref == 'main'");
    expect(verify).toContain('MAIN_RELEASE_PR:');
    const engines = workflow.split(/^  engines:\n/m)[1] ?? '';
    expect(engines).toContain("github.base_ref == 'main'");
    for (const project of ['webkit-phone', 'webkit-desktop', 'firefox-desktop']) {
      expect(engines).toContain(project);
    }
  });

  it('accepts a main release only if all its engine jobs succeed', () => {
    expect(runGate().status).toBe(0);
    for (const conclusion of ['failure', 'skipped', 'neutral', 'cancelled', 'in_progress']) {
      const result = runGate({ ENGINES: conclusion });
      expect(result.status, conclusion).toBe(1);
      expect(result.stdout).toContain('Safari and Firefox release browser tests did not all pass');
    }
  });

  it('rejects a docs-only shortcut or Chromium failure on a main release', () => {
    expect(runGate({ DOCS_ONLY: 'true', BROWSER: 'skipped' }).status).toBe(1);
    expect(runGate({ BROWSER: 'failure' }).status).toBe(1);
    expect(runGate({ CHECKS: 'failure' }).status).toBe(1);
  });

  it('does not require optional engines for normal staging PRs', () => {
    expect(runGate({ MAIN_RELEASE_PR: 'false', ENGINES: 'skipped' }).status).toBe(0);
    expect(runGate({ MAIN_RELEASE_PR: 'false', ENGINES: 'skipped', DOCS_ONLY: 'true', BROWSER: 'skipped' }).status).toBe(0);
    expect(runGate({ MAIN_RELEASE_PR: 'false', ENGINES: 'skipped', BROWSER: 'failure' }).status).toBe(1);
  });
});
