/**
 * Read-only release gate for anatomy assets. Run after a production-style Astro build, never on an unbuilt source tree.
 * This verifies the actual dist/ output, not merely the draft-filtering functions.
 *
 * Usage: node scripts/anatomy-production-audit.mjs [dist-directory] [content/visuals-directory]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ANATOMY_FILE = /^anatomy-[a-z0-9-]+\.json$/;
const MODEL_URL = /^\/models\/anatomy\/[a-z0-9][a-z0-9_-]*\.glb$/;
// Scan all ordinary published text assets, not just the anatomy page or hashed JavaScript chunks.
// Site search, manifests or unrelated pages can otherwise accidentally expose a draft identifier.
const TEXT_ASSET = /\.(?:html?|js|mjs|json|map|xml|svg|txt|css|csv|tsv|md|webmanifest)$/i;

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(p);
    if (entry.isFile()) return [p];
    return [];
  });
}

/** Extracts references without trusting paths from content files as filesystem paths. */
export function modelUrls(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return null;
  const refs = [model.file];
  if (model.files !== undefined) {
    if (!Array.isArray(model.files)) return null;
    refs.push(...model.files);
  }
  if (model.layerFiles !== undefined) {
    if (!model.layerFiles || typeof model.layerFiles !== 'object' || Array.isArray(model.layerFiles)) return null;
    for (const list of Object.values(model.layerFiles)) {
      if (!Array.isArray(list)) return null;
      refs.push(...list);
    }
  }
  return refs.every((url) => typeof url === 'string' && MODEL_URL.test(url)) ? [...new Set(refs)] : null;
}

/**
 * Audit a built production site against the current source-file publication statuses.
 * No writes or network operations. Return every error instead of stopping at the first one.
 */
export function auditAnatomyProduction(distDir, contentDir) {
  const dist = resolve(distDir);
  const content = resolve(contentDir);
  const errors = [];
  const approved = new Set();
  const draft = new Set();
  const draftIds = new Set();
  let approvedSystems = 0;
  let draftSystems = 0;

  if (!existsSync(dist) || !statSync(dist).isDirectory()) {
    return { errors: [`production output does not exist: ${dist}`], approvedSystems, draftSystems, shippedModels: 0 };
  }
  if (!existsSync(content) || !statSync(content).isDirectory()) {
    return { errors: [`anatomy source directory does not exist: ${content}`], approvedSystems, draftSystems, shippedModels: 0 };
  }

  const sources = readdirSync(content).filter((n) => ANATOMY_FILE.test(n)).sort();
  if (!sources.length) errors.push('no anatomy source files found');
  for (const name of sources) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(content, name), 'utf8'));
    } catch {
      errors.push(`${name}: cannot read valid JSON`);
      continue;
    }
    if (!data || (data.status !== 'approved' && data.status !== 'draft')) {
      errors.push(`${name}: invalid publication status`);
      continue;
    }
    const urls = modelUrls(data.model);
    if (!urls) {
      errors.push(`${name}: invalid model URL list`);
      continue;
    }
    if (data.status === 'approved') {
      approvedSystems++;
      urls.forEach((url) => approved.add(url));
      // Independently verify the source links even when dist/ is older than the
      // current manifest. A nonempty citation string is not proof of a source.
      const sourceIds = new Set();
      if (!Array.isArray(data.sources) || data.sources.length === 0) {
        errors.push(`${name}: approved source records are missing`);
      } else {
        for (const source of data.sources) {
          if (!source || typeof source.id !== 'string' || !source.id.trim()) {
            errors.push(`${name}: invalid approved source ID`);
          } else if (sourceIds.has(source.id)) {
            errors.push(`${name}: duplicate approved source ID ${source.id}`);
          } else {
            sourceIds.add(source.id);
          }
        }
      }
      // A production-style audit must also reject a damaged *approved* record.
      // Otherwise a stale dist/ can pass despite having no reviewed source names.
      if (!Array.isArray(data.labels) || data.labels.length === 0) {
        errors.push(`${name}: approved labels are missing`);
      } else {
        const seenIds = new Set();
        for (const label of data.labels) {
          if (!label || typeof label.id !== 'string' || !/^FMA\d{3,}$/.test(label.id)) {
            errors.push(`${name}: invalid approved label ID`);
            continue;
          }
          if (seenIds.has(label.id)) errors.push(`${name}: duplicate approved label ID ${label.id}`);
          seenIds.add(label.id);
          if (typeof label.text !== 'string' || label.text.trim().length === 0) {
            errors.push(`${name}: approved label ${label.id} has no official name`);
          }
          if (typeof label.source !== 'string' || label.source.trim().length === 0) {
            errors.push(`${name}: approved label ${label.id} has no source citation`);
          } else if (!sourceIds.has(label.source)) {
            errors.push(`${name}: approved label ${label.id} references unknown source ${label.source}`);
          }
        }
      }
    } else {
      draftSystems++;
      urls.forEach((url) => draft.add(url));
      if (!Array.isArray(data.labels) || data.labels.length === 0) {
        errors.push(`${name}: draft labels are missing`);
      } else {
        for (const label of data.labels) {
          if (!label || typeof label.id !== 'string' || !/^FMA\d{3,}$/.test(label.id)) {
            errors.push(`${name}: invalid draft label ID`);
          } else {
            draftIds.add(label.id);
          }
        }
      }
    }
  }

  for (const url of approved) {
    if (draft.has(url)) errors.push(`ambiguous approval: ${url} is also referenced by a draft`);
  }

  const modelRoot = join(dist, 'models', 'anatomy');
  const shipped = walkFiles(modelRoot).filter((p) => p.toLowerCase().endsWith('.glb'));
  for (const path of shipped) {
    const url = '/models/anatomy/' + path.slice(modelRoot.length + 1).replaceAll('\\', '/');
    if (!approved.has(url)) errors.push(`unapproved model exposed in production: ${url}`);
  }
  for (const url of approved) {
    if (!shipped.some((p) => '/models/anatomy/' + p.slice(modelRoot.length + 1).replaceAll('\\', '/') === url)) {
      errors.push(`approved model missing from production: ${url}`);
    }
  }

  const fixtureRoot = join(dist, 'preview', 'anatomy-fixture');
  for (const p of walkFiles(fixtureRoot)) {
    errors.push(`test fixture exposed in production: /preview/anatomy-fixture/${p.slice(fixtureRoot.length + 1).replaceAll('\\', '/')}`);
  }

  // Draft labels must not be baked into static HTML/JS data, even if their .glb files were pruned.
  // The identifiers are original data keys, not guessed medical wording. Only match exact token boundaries.
  // Search every static text asset, including Pagefind/search data and other public routes.
  // Token boundaries avoid confusing FMA999991 with FMA9999910. Unknown ID formats fail source validation above.
  const textFiles = walkFiles(dist).filter((path) => TEXT_ASSET.test(path));
  const draftTokens = draftIds;
  if (draftTokens.size) {
    for (const file of textFiles) {
      const contents = readFileSync(file, 'utf8');
      for (const match of contents.matchAll(/\bFMA\d{3,}\b/g)) {
        if (draftTokens.has(match[0])) {
          errors.push(`draft anatomy ID exposed in built text: ${file.slice(dist.length + 1)} (${match[0]})`);
          break;
        }
      }
    }
  }

  return { errors, approvedSystems, draftSystems, shippedModels: shipped.length };
}

function runCli() {
  if (process.argv.length > 4) {
    process.stderr.write('usage: node scripts/anatomy-production-audit.mjs [dist] [content/visuals]\n');
    process.exitCode = 2;
    return;
  }
  const result = auditAnatomyProduction(process.argv[2] ?? 'dist', process.argv[3] ?? 'content/visuals');
  if (result.errors.length) {
    process.stderr.write(`anatomy production audit FAILED (${result.errors.length} issue(s)):\n`);
    for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`anatomy production audit PASS: ${result.approvedSystems} approved system(s), ${result.draftSystems} draft system(s), ${result.shippedModels} shipped model(s)\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
