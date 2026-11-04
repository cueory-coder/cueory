import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

it('omits the building notice from every page when its copied build config disables it', () => {
  const isolated = mkdtempSync(join(tmpdir(), 'cueory-notice-off-'));
  const original = readFileSync(join(root, 'src/config/site.ts'), 'utf8');
  try {
    // Copy the complete build inputs, never mutate the working checkout or its dist.
    for (const name of ['src', 'content', 'public', 'docs', 'scripts', 'package.json', 'package-lock.json', 'astro.config.mjs', 'tsconfig.json', 'wrangler.jsonc']) {
      cpSync(join(root, name), join(isolated, name), { recursive: true });
    }
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
