import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/launch-check.mjs', import.meta.url));
const temporaryFolders: string[] = [];
function fixture(files: Record<string, string> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'cueory-launch-check-'));
  temporaryFolders.push(cwd);
  for (const [file, content] of Object.entries(files)) {
    const path = join(cwd, 'dist', file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return cwd;
}
const run = (cwd: string) => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', timeout: 10_000 });
afterEach(() => { for (const folder of temporaryFolders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe('launch readiness report', () => {
  it('reports every built page including zero findings and a noindex page', () => {
    const cwd = fixture({
      'index.html': '<h1>ready</h1>',
      'learn/topic/index.html': '<meta name="robots" content="noindex, nofollow"><p data-placeholder="CHRISTIAN-TEXT">Coming Soon. sample placeholder opens soon.</p>',
      '404.html': '<h1>missing page</h1>',
      'support.html': '<h1>support</h1>',
    });
    const result = run(cwd);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('/ | CHRISTIAN-TEXT=0 | coming soon=0 | sample=0 | placeholder=0 | opens soon=0 | noindex=no');
    expect(result.stdout).toContain('/learn/topic | CHRISTIAN-TEXT=1 | coming soon=1 | sample=1 | placeholder=1 | opens soon=1 | noindex=yes');
    expect(result.stdout).toContain('/404.html |');
    expect(result.stdout).toContain('/support |');
    expect(result.stdout).toContain('Pages: 4.');
  });

  it('counts whole visible words and phrases across tags and encoded spaces, ignoring code and comments', () => {
    const cwd = fixture({ 'index.html': '<!-- sample <p data-placeholder="CHRISTIAN-TEXT"> -->' +
      '<script>"sample placeholder coming soon opens soon <p data-placeholder=CHRISTIAN-TEXT>"</script><style>.sample{}</style>' +
      '<p data-note="sample">Coming&nbsp;soon <b>coming</b> soon sample SAMPLE samples placeholder placeholders opens&#32;soon</p>' });
    expect(run(cwd).stdout).toContain('CHRISTIAN-TEXT=0 | coming soon=2 | sample=2 | placeholder=1 | opens soon=1');
  });

  it('recognizes attribute order, case, single quotes and unquoted marker values', () => {
    const cwd = fixture({ 'index.html': '<META CONTENT="NOINDEX,NOFOLLOW" NAME=robots>' +
      "<p DATA-PLACEHOLDER = 'CHRISTIAN-TEXT'></p><p data-placeholder=CHRISTIAN-TEXT></p>" });
    expect(run(cwd).stdout).toContain('CHRISTIAN-TEXT=2');
    expect(run(cwd).stdout).toContain('noindex=yes');
  });

  it('does not join separated markup into new directives when ignoring comments', () => {
    const cwd = fixture({ 'index.html': '<met<!-- ignored -->a name="robots" content="noindex">' +
      '<p data-place<!-- ignored -->holder="CHRISTIAN-TEXT">sample</p>' });
    const result = run(cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('CHRISTIAN-TEXT=0');
    expect(result.stdout).toContain('sample=1');
    expect(result.stdout).toContain('noindex=no');
  });

  it('does not mistake noindex text or an index directive for a noindex robots meta', () => {
    const cwd = fixture({ 'index.html': '<meta name="robots" content="index,follow"><p>noindex</p><meta name="description" content="noindex">' });
    expect(run(cwd).stdout).toContain('noindex=no');
  });

  it('omits Pagefind fragments, Astro assets, non-HTML files and symlinked folders', () => {
    const cwd = fixture({ 'index.html': 'sample', 'pagefind/fragment.html': 'sample', '_astro/asset.html': 'sample', 'data.json': 'sample' });
    symlinkSync(join(cwd, 'dist'), join(cwd, 'dist', 'loop'), 'dir');
    const result = run(cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Pages: 1.');
    expect(result.stdout).not.toContain('/pagefind/');
    expect(result.stdout).not.toContain('/_astro/');
    expect(result.stdout).not.toContain('/loop/');
  });

  it('always exits zero with a helpful report when dist is missing or is not a directory', () => {
    const cwd = fixture();
    expect(run(cwd).status).toBe(0);
    expect(run(cwd).stdout).toContain('No HTML pages scanned. Run npm run build first.');
    writeFileSync(join(cwd, 'dist'), 'not a directory');
    const result = run(cwd);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('warning: could not read dist');
  });

  it('does not rewrite source HTML or create any report files', () => {
    const html = '<p data-placeholder="CHRISTIAN-TEXT">sample</p>';
    const cwd = fixture({ 'index.html': html });
    expect(run(cwd).status).toBe(0);
    expect(readFileSync(join(cwd, 'dist/index.html'), 'utf8')).toBe(html);
    expect(readdirSync(cwd)).toEqual(['dist']);
    expect(readdirSync(join(cwd, 'dist'))).toEqual(['index.html']);
  });
});
