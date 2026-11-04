import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

function pages(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? pages(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

/** Copy optional synthetic inputs used by preview-page imports into an isolated build. */
function copyBuildFixtures(fromRoot: string, toRoot: string): void {
  const fixtures = join(fromRoot, 'tests', 'fixtures');
  if (!existsSync(fixtures)) return;
  mkdirSync(join(toRoot, 'tests'), { recursive: true });
  cpSync(fixtures, join(toRoot, 'tests', 'fixtures'), { recursive: true });
}

it('preserves relative test-fixture imports in isolated builds when fixtures exist', () => {
  const source = mkdtempSync(join(tmpdir(), 'cueory-build-fixtures-source-'));
  const target = mkdtempSync(join(tmpdir(), 'cueory-build-fixtures-target-'));
  try {
    // No fixtures is a supported input on older branches.
    copyBuildFixtures(source, target);
    expect(existsSync(join(target, 'tests'))).toBe(false);

    const sourceFixtures = join(source, 'tests', 'fixtures');
    mkdirSync(sourceFixtures, { recursive: true });
    writeFileSync(join(sourceFixtures, 'sample.json'), '{"name":"synthetic"}');
    copyBuildFixtures(source, target);
    expect(readFileSync(join(target, 'tests', 'fixtures', 'sample.json'), 'utf8')).toBe('{"name":"synthetic"}');
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

it('omits the building notice from every page when its copied build config disables it', () => {
  const isolated = mkdtempSync(join(tmpdir(), 'cueory-notice-off-'));
  const original = readFileSync(join(root, 'src/config/site.ts'), 'utf8');
  try {
    // Copy the complete build inputs, never mutate the working checkout or its dist.
    for (const name of ['src', 'content', 'public', 'docs', 'scripts', 'package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.json', 'wrangler.jsonc']) {
      cpSync(join(root, name), join(isolated, name), { recursive: true });
    }
    // Preserve source-relative fixture imports used by preview-only pages.
    copyBuildFixtures(root, isolated);
    symlinkSync(join(root, 'node_modules'), join(isolated, 'node_modules'), 'junction');
    expect(original.match(/showBuildingNotice:\s*(?:true|false)/g)).toHaveLength(1);
    writeFileSync(join(isolated, 'src/config/site.ts'), original.replace(/showBuildingNotice:\s*(?:true|false)/, 'showBuildingNotice: false'));
    const astroPackage = JSON.parse(readFileSync(join(root, 'node_modules/astro/package.json'), 'utf8'));
    const astroCli = join(root, 'node_modules/astro', astroPackage.bin.astro);
    execFileSync(process.execPath, [astroCli, 'build'], {
      cwd: isolated,
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 90_000,
    });
    const built = pages(join(isolated, 'dist'));
    expect(built.map((path) => path.slice(join(isolated, 'dist').length)).sort()).toEqual(
      pages(join(root, 'dist')).map((path) => path.slice(join(root, 'dist').length)).sort(),
    );
    expect(built.length).toBeGreaterThan(0);
    for (const path of built) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/data-testid=["']building-notice["']/);
    }
  } finally {
    rmSync(isolated, { recursive: true, force: true });
    expect(readFileSync(join(root, 'src/config/site.ts'), 'utf8')).toBe(original);
  }
}, 120_000);
