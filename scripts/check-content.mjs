#!/usr/bin/env node
/**
 * Checks every JSON file in /content against the same schemas the build uses (src/content.config.ts), before you
 * commit or push. Steps for Christian: content/README.md, "How to add a lesson in 3 steps".
 *
 *   node scripts/check-content.mjs                  checks this repository's content/ folder
 *   node scripts/check-content.mjs --content <dir>  checks another content folder (tests use this)
 *   node scripts/check-content.mjs --map <csv>      uses another lesson map
 *
 * It prints each problem on its own line with the file and the field, then which lessons become pages, which stay
 * labeled samples and which files are drafts that won't appear. It writes nothing.
 *
 * Exit code: 0 no problems, 1 problems found, 2 the command was typed wrong.
 *
 * How it uses the build's own rules without running a build: src/content.config.ts imports `astro:content` and
 * `astro/loaders`, which exist only inside Astro. The hooks below give it two tiny stand-ins (defineCollection returns
 * the collection as written, glob returns its folder and pattern), so the real schemas, refinements and parsers load
 * unchanged, and Node runs the TypeScript files directly.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const USAGE = 'Usage: node scripts/check-content.mjs [--content <folder>] [--map <lesson-map.csv>]';

const stubs = {
  'astro:content': 'export const defineCollection = (collection) => collection;',
  'astro/loaders': 'export const glob = (options) => ({ glob: options });',
};
registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(stubs, specifier)) {
      return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    }
    // The site's TypeScript imports its own files without an extension (`./islands/fillin`), as Vite allows.
    if (/^\.\.?\//.test(specifier) && context.parentURL?.endsWith('.ts') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ending of ['.ts', '/index.ts']) {
        const candidate = new URL(specifier + ending, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
});

function fail(message) {
  console.error(message);
  process.exit(2);
}

let args;
try {
  args = parseArgs({ options: { content: { type: 'string' }, map: { type: 'string' } }, allowPositionals: false });
} catch {
  fail(USAGE);
}
const contentDir = resolve(args.values.content ?? join(root, 'content'));
const mapFile = resolve(args.values.map ?? join(root, 'docs/curriculum/medsurg-lesson-map.csv'));
if (!existsSync(contentDir)) fail(`There is no content folder at ${contentDir}.`);
if (!existsSync(mapFile)) fail(`There is no lesson map at ${mapFile}.`);

const load = (path) => import(pathToFileURL(join(root, path)).href);
const { collections } = await load('src/content.config.ts');
const { buildCatalog, contentEntryId } = await load('src/lessons/catalog.ts');
const { parseLessonMap } = await load('src/islands/lessonmap.ts');
const { fileProblems, lessonReport } = await load('scripts/check-content/report.ts');

/** "content/cards/x.json", the way Christian sees the folder, wherever it is. */
const shownPath = (file) => relative(dirname(contentDir), file).split(sep).join('/');

const problems = [];
const read = {};
let checked = 0;
for (const [name, collection] of Object.entries(collections)) {
  const glob = collection.loader?.glob;
  if (!glob?.base) continue;
  const folder = resolve(contentDir, relative(join(root, 'content'), resolve(root, glob.base)));
  read[name] = [];
  if (!existsSync(folder)) continue;
  for (const relativeFile of globSync(glob.pattern, { cwd: folder }).sort()) {
    const file = join(folder, relativeFile);
    const shown = shownPath(file);
    checked++;
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push(`${shown}: isn't valid JSON (${error instanceof Error ? error.message : 'unreadable'}). Check for a missing comma, quote or bracket.`);
      continue;
    }
    read[name].push({ file: shown, id: contentEntryId(relativeFile), data });
    const result = await collection.schema.safeParseAsync(data);
    if (!result.success) problems.push(...fileProblems(shown, result.error.issues, data));
  }
}

const { units, problems: mapProblems } = parseLessonMap(readFileSync(mapFile, 'utf8'));
for (const problem of mapProblems) problems.push(`${shownPath(mapFile)}: row ${problem.row}: ${problem.message}`);

// The lesson rules (names, which lesson a file belongs to, status) are the pages' own (src/lessons/catalog.ts).
const objects = (files) => files.filter((entry) => entry.data !== null && typeof entry.data === 'object' && !Array.isArray(entry.data));
const lessonFiles = objects(read.lessons ?? []);
const companions = [...objects(read.cards ?? []), ...objects(read['fill-in'] ?? []), ...objects(read.organizer ?? [])];
const catalog = buildCatalog({
  lessons: lessonFiles,
  cards: objects(read.cards ?? []),
  fillIn: objects(read['fill-in'] ?? []),
  organizer: objects(read.organizer ?? []),
  units,
});
problems.push(...catalog.problems);

console.log(`checked ${checked} ${checked === 1 ? 'file' : 'files'} in ${shownPath(contentDir) || 'content'}`);
if (problems.length) {
  console.log(`${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} to fix:`);
  for (const problem of problems) console.log(`  ${problem}`);
} else {
  console.log('no problems found');
}
console.log('');
for (const line of lessonReport(catalog, lessonFiles, companions)) console.log(line);
process.exit(problems.length ? 1 : 0);
