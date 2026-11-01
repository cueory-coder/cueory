/** Export draft review sheets outside the repository: node scripts/visuals-sheet.ts --out <folder>. */
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { reviewSheet } from '../src/visuals/sheet.ts';
import type { Visual } from '../src/visuals/sources.ts';

const repository = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const sourceFolder = join(repository, 'content', 'visuals');
const usage = 'usage: node scripts/visuals-sheet.ts --out <folder>';

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

/** Resolve existing ancestor links even when the requested output folder does not exist yet. */
function physicalPath(path: string): string {
  const tail: string[] = [];
  let ancestor = path;
  for (;;) {
    try { lstatSync(ancestor); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      tail.unshift(basename(ancestor));
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  return resolve(realpathSync(ancestor), ...tail);
}

export function parseArguments(args: string[]): { out: string } {
  const { values, tokens } = parseArgs({
    args, strict: true, allowPositionals: false, tokens: true,
    options: { out: { type: 'string' } },
  });
  if (!values.out || tokens.filter(token => token.kind === 'option' && token.name === 'out').length !== 1) {
    throw new Error('--out must name exactly one output folder.');
  }
  const requested = resolve(values.out);
  if (inside(repository, requested)) throw new Error('--out must be outside the repository.');
  const out = physicalPath(requested);
  if (inside(repository, out)) throw new Error('--out must be outside the repository, including through symbolic links.');
  return { out };
}

interface SheetFile { name: string; text: string }

/** Prepare every document before creating an output folder. Only draft visuals get sheets. */
export function sheetFiles(visuals: readonly Visual[]): SheetFile[] {
  const result: SheetFile[] = [];
  const seen = new Set<string>();
  for (const visual of visuals) {
    if (!visual || (visual.status !== 'draft' && visual.status !== 'approved')) throw new Error('each visual needs draft or approved status.');
    if (visual.status !== 'draft') continue;
    if (typeof visual.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(visual.id) || visual.id === 'index') {
      throw new Error('each draft needs a safe lowercase id other than index.');
    }
    if (seen.has(visual.id)) throw new Error(`two drafts have the id ${visual.id}.`);
    seen.add(visual.id);
    result.push({ name: `${visual.id}.md`, text: reviewSheet(visual) });
  }
  const links = result.map(file => {
    const id = file.name.slice(0, -3);
    return `- [${id}](${file.name})`;
  });
  return [...result, { name: 'index.md', text: ['# visual review sheets', '', ...links, ''].join('\n') }];
}

function sourceFiles(folder: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name);
    const entry = lstatSync(path);
    if (entry.isSymbolicLink()) throw new Error(`source files cannot be symbolic links: ${path}`);
    if (entry.isDirectory()) result.push(...sourceFiles(path));
    else if (entry.isFile() && name.endsWith('.json')) result.push(path);
  }
  return result;
}

function exists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Exit 0 on success, 2 for arguments/output location, and 1 for source or filesystem failures. */
export function main(args = process.argv.slice(2)): number {
  let out: string;
  try { out = parseArguments(args).out; }
  catch (error) {
    console.error(`${usage}\n${error instanceof Error ? error.message : 'invalid arguments.'}`);
    return 2;
  }
  try {
    const visuals = sourceFiles(sourceFolder).map(path => {
      try { return JSON.parse(readFileSync(path, 'utf8')) as Visual; }
      catch { throw new Error(`could not read the visual JSON: ${path}`); }
    });
    const files = sheetFiles(visuals);
    // Check the whole batch first, including directories and dangling symlinks, before writing any sheet.
    for (const file of files) {
      const path = join(out, file.name);
      if (exists(path)) throw new Error(`refusing existing output: ${path}`);
    }
    mkdirSync(out, { recursive: true });
    for (const file of files) writeFileSync(join(out, file.name), file.text, { flag: 'wx' });
    console.log(`wrote ${files.length - 1} draft review sheets and ${join(out, 'index.md')}`);
    return 0;
  } catch (error) {
    console.error(`could not write review sheets: ${error instanceof Error ? error.message : 'unexpected failure.'}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
