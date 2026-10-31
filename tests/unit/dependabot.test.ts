import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const yml = readFileSync(new URL('../../.github/dependabot.yml', import.meta.url), 'utf8');
const nodeMajor = Number(readFileSync(new URL('../../.node-version', import.meta.url), 'utf8').trim().split('.')[0]);

describe('Dependabot settings', () => {
  it('never offers TypeScript 7, which Astro\'s type checker rejects (D-02)', () => {
    expect(yml).toMatch(/- dependency-name: typescript\n\s+versions: \['>=7\.0\.0'\]/);
  });

  it('never offers Node type files newer than the Node version we run (D-01)', () => {
    expect(nodeMajor).toBe(24);
    expect(yml).toContain(`- dependency-name: '@types/node'\n        versions: ['>=${nodeMajor + 1}.0.0']`);
  });

  it('sends every update to staging first', () => {
    expect(yml.match(/target-branch: staging/g)).toHaveLength(2);
  });
});
