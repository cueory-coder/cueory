import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArguments, sheetFiles } from '../../scripts/visuals-sheet.ts';
import { reviewSheet } from '../../src/visuals/sheet';
import type { Visual } from '../../src/visuals/sources';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const script = join(repository, 'scripts', 'visuals-sheet.ts');
const folders: string[] = [];
const temporary = () => {
  const folder = mkdtempSync(join(tmpdir(), 'cueory-sheets-'));
  folders.push(folder);
  return folder;
};
const cli = (args: string[], cwd: string) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 10_000 });
const visuals: Visual[] = readdirSync(join(repository, 'content', 'visuals')).filter(name => name.endsWith('.json')).sort()
  .map(name => JSON.parse(readFileSync(join(repository, 'content', 'visuals', name), 'utf8')));

afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe('arguments and output location', () => {
  it.each([[], ['--out'], ['--out', ''], ['--unknown'], ['a-folder'], ['--out', '/tmp/a', '--out', '/tmp/b']].map(args => ({ args })))('refuses arguments $args', ({ args }) => {
    expect(() => parseArguments(args)).toThrow();
  });

  it('accepts an outside folder with spaces, without creating it', () => {
    const parent = temporary();
    const out = join(parent, 'not created yet', 'review sheets');
    const expected = join(realpathSync(parent), 'not created yet', 'review sheets');
    expect(parseArguments(['--out', out]).out).toBe(expected);
    expect(parseArguments([`--out=${out}`]).out).toBe(expected);
    expect(existsSync(out)).toBe(false);
  });

  it('canonicalizes an outside temporary-folder alias before adding nonexistent children', () => {
    const parent = temporary();
    const actual = join(parent, 'actual');
    const alias = join(parent, 'alias');
    mkdirSync(actual);
    symlinkSync(actual, alias, 'dir');
    const out = join(alias, 'not created yet', 'review sheets');
    expect(parseArguments(['--out', out]).out).toBe(join(realpathSync(actual), 'not created yet', 'review sheets'));
    expect(existsSync(out)).toBe(false);
  });

  it('refuses the repository itself, a child and normalized traversal back into it', () => {
    for (const out of [repository, join(repository, 'review-sheets'), resolve(repository, '..', basename(repository), 'review-sheets')]) {
      expect(() => parseArguments(['--out', out])).toThrow('outside the repository');
    }
  });

  it('refuses an outside symlink into the repository, including a new child under that link', () => {
    const link = join(temporary(), 'repository-link');
    symlinkSync(repository, link, 'dir');
    for (const out of [link, join(link, 'not-created')]) {
      expect(() => parseArguments(['--out', out])).toThrow('outside the repository');
    }
    expect(existsSync(join(repository, 'not-created'))).toBe(false);
  });

  it('reports missing --out from the actual Node entry point and creates nothing', () => {
    const cwd = temporary();
    const result = cli([], cwd);
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toContain('--out');
    expect(readdirSync(cwd)).toEqual([]);
  });
});

describe('draft sheet planning', () => {
  it('copies the three actual drafts through reviewSheet and indexes every filename', () => {
    expect(visuals).toHaveLength(3);
    expect(visuals.every(visual => visual.status === 'draft')).toBe(true);
    const files = sheetFiles(visuals);
    expect(files).toHaveLength(4);
    for (const visual of visuals) {
      expect(files.find(file => file.name === `${visual.id}.md`)?.text).toBe(reviewSheet(visual));
      expect(files.at(-1)?.text).toContain(`- [${visual.id}](${visual.id}.md)`);
    }
  });

  it('omits approved visuals and keeps the source records unchanged', () => {
    const input: Visual[] = [visuals[0]!, { ...visuals[1]!, status: 'approved' }];
    const before = JSON.stringify(input);
    expect(sheetFiles(input).map(file => file.name)).toEqual([`${visuals[0]!.id}.md`, 'index.md']);
    expect(JSON.stringify(input)).toBe(before);
    expect(sheetFiles([{ ...visuals[0]!, status: 'approved' }])).toEqual([{ name: 'index.md', text: '# visual review sheets\n\n' }]);
  });

  it.each(['../outside', '/absolute', 'a/b', 'a\\b', 'UPPER', 'index', ''])('refuses unsafe or reserved draft id %j', id => {
    expect(() => sheetFiles([{ ...visuals[0]!, id }])).toThrow('safe lowercase id');
  });

  it('refuses duplicate ids and invalid source references before writing', () => {
    expect(() => sheetFiles([visuals[0]!, visuals[0]!])).toThrow('two drafts');
    const visual = structuredClone(visuals[0]!);
    visual.labels = [{ ...visual.labels[0]!, source: 'sample-missing-source' }];
    expect(() => sheetFiles([visual])).toThrow("isn't in the file");
  });
});

describe('native Node export', () => {
  it('writes three real sheets and an index outside the repository, from any working folder', () => {
    const cwd = temporary();
    const out = join(cwd, 'nested', 'review sheets');
    const result = cli(['--out', out], cwd);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('3 draft review sheets');
    expect(readdirSync(out).sort()).toEqual(['index.md', ...visuals.map(visual => `${visual.id}.md`)].sort());
    for (const file of sheetFiles(visuals)) expect(readFileSync(join(out, file.name), 'utf8')).toBe(file.text);
    const again = cli(['--out', out], cwd);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('refusing existing output');
    for (const file of sheetFiles(visuals)) expect(readFileSync(join(out, file.name), 'utf8')).toBe(file.text);
  });

  it.each(['sheet', 'index', 'directory', 'dangling symlink'])('stops before creating any sheets when a %s output already exists', kind => {
    const cwd = temporary();
    const out = join(cwd, 'output');
    mkdirSync(out);
    const name = kind === 'sheet' ? `${visuals[0]!.id}.md` : 'index.md';
    const existing = join(out, name);
    if (kind === 'directory') mkdirSync(existing);
    else if (kind === 'dangling symlink') symlinkSync(join(cwd, 'does-not-exist'), existing);
    else writeFileSync(existing, 'sample: keep this existing file');
    const result = cli(['--out', out], cwd);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(join(realpathSync(out), name));
    expect(readdirSync(out)).toEqual([name]);
    if (kind === 'sheet' || kind === 'index') expect(readFileSync(existing, 'utf8')).toBe('sample: keep this existing file');
  });

  it('refuses an inside-repository destination from the native entry point', () => {
    const cwd = temporary();
    const result = cli(['--out', join(repository, 'review-sheets')], cwd);
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toContain('outside the repository');
    expect(readdirSync(cwd)).toEqual([]);
  });
});
