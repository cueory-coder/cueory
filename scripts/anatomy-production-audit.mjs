/**
 * Read-only release gate for anatomy assets. Run after a production-style Astro build, never on an unbuilt source tree.
 * This verifies the actual dist/ output, not merely the draft-filtering functions.
 *
 * Usage: node scripts/anatomy-production-audit.mjs [dist-directory] [content/visuals-directory]
 */
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ANATOMY_FILE = /^anatomy-[a-z0-9-]+\.json$/;
const MODEL_URL = /^\/models\/anatomy\/[a-z0-9][a-z0-9_-]*\.glb$/;
// Match the canonical BodyParts3D IDs accepted by src/content.config.ts.
const STRUCTURE_ID = /^(?:FMA|BP)\d+[a-z]*$/;
const STRUCTURE_TOKEN = /\b(?:FMA|BP)\d+[a-z]*\b/g;
const BODYPARTS3D_URL_PREFIX = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/';
// Fail closed on any publicly shipped 3D geometry, including misplaced copies and raw source meshes.
const MODEL_ASSET = /\.(?:glb|gltf|obj|stl)$/i;
// Scan all ordinary published text assets, not just the anatomy page or hashed JavaScript chunks.
// Site search, manifests or unrelated pages can otherwise accidentally expose a draft identifier.
const TEXT_ASSET = /\.(?:html?|js|mjs|json|map|xml|svg|txt|css|csv|tsv|md|webmanifest)$/i;
const SCRIPT_ESCAPES_ASSET = /\.(?:js|mjs|json|map|webmanifest|html?)$/i;
const MARKUP_ESCAPES_ASSET = /\.(?:html?|svg|xml)$/i;
const CSS_ESCAPES_ASSET = /\.css$/i;

/** Walk a built artifact without following links outside (or back into) the output. */
function walkFiles(dir, linked) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      linked.push(p); // A link is not proof of a reviewed production asset.
      return [];
    }
    if (entry.isDirectory()) return walkFiles(p, linked);
    if (entry.isFile()) return [p];
    return [];
  });
}

/**
 * Read an audited regular file through its opened descriptor, never through a
 * later pathname lookup. If a file changes into a symlink after directory
 * enumeration, O_NOFOLLOW rejects it instead of reading its target.
 */
export function readRegularFileNoFollow(path) {
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
    throw new Error('this platform cannot safely audit symbolic links');
  }
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('not a regular file');
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Decode common ASCII escapes before scanning generated text for draft IDs.
 * Bundlers can emit JSON/JS Unicode escapes, and HTML can use numeric entities.
 * This is read-only normalization for the audit, not a change to shipped files.
 */
export function decodeAsciiEscapesForAudit(text, syntax) {
  if (syntax === 'script') {
    // Decode only active JS escapes. An even run of backslashes means the
    // slash was itself escaped, so "\\u0046" is text, not the letter F.
    // Preserve preceding escaped slash pairs while decoding a final odd slash.
    // Padded code-point escapes such as \u{0046} are valid JavaScript too.
    // V8 accepts arbitrarily many leading zeroes inside braces, so do not
    // cap the hex digit count or a legal encoded draft ID can evade the gate.
    return text.replace(/(?<!\\)((?:\\\\)*)\\(?:u00([0-7][0-9a-f])|x([0-7][0-9a-f])|u\{([0-9a-f]+)\})/gi,
      (match, pairs, unicode, hex, braced) => {
        const value = Number.parseInt(unicode ?? hex ?? braced, 16);
        return Number.isInteger(value) && value <= 127 ? pairs + String.fromCharCode(value) : match;
      });
  }
  if (syntax === 'markup') {
    // HTML numeric references may omit the semicolon and may contain any
    // number of leading zeroes (for example &#00000070IX001 is FIX001).
    // Consume the complete digit run or padded encodings bypass the audit.
    return text.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (match, hex, decimal) => {
      const value = hex === undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex, 16);
      return value <= 127 ? String.fromCharCode(value) : match;
    });
  }
  if (syntax === 'css') {
    // CSS hex escapes use one to six digits, optionally followed by one space
    // or other CSS whitespace. Paired backslashes are literal, not active escapes.
    return text.replace(/(?<!\\)((?:\\\\)*)\\([0-9a-f]{1,6})(?:[ \t\r\n\f])?/gi,
      (match, pairs, hex) => {
        const value = Number.parseInt(hex, 16);
        return value > 0 && value <= 127 ? pairs + String.fromCharCode(value) : match;
      });
  }
  return text;
}

/** Validate a real ISO calendar date, not just the YYYY-MM-DD shape. */
function validRetrievedDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
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

  // Root paths must be real directories too. A symlink as the audit root
  // otherwise bypasses walkFiles' per-entry symlink rejection.
  if (lstatSync(dist).isSymbolicLink()) {
    return { errors: [`production output root is a symbolic link: ${dist}`], approvedSystems, draftSystems, shippedModels: 0 };
  }
  if (lstatSync(content).isSymbolicLink()) {
    return { errors: [`anatomy source root is a symbolic link: ${content}`], approvedSystems, draftSystems, shippedModels: 0 };
  }

  const sources = readdirSync(content).filter((n) => ANATOMY_FILE.test(n)).sort();
  if (!sources.length) errors.push('no anatomy source files found');
  for (const name of sources) {
    const sourcePath = join(content, name);
    let data;
    try {
      data = JSON.parse(readRegularFileNoFollow(sourcePath));
    } catch (error) {
      const linked = error && typeof error === 'object' && 'code' in error && error.code === 'ELOOP';
      errors.push(linked ? `${name}: anatomy source must not be a symbolic link` : `${name}: cannot read valid JSON`);
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
          // JSON can contain null or primitive entries; report them instead of
          // throwing before the audit checks the remaining release evidence.
          if (!source || typeof source !== 'object' || Array.isArray(source)) {
            errors.push(`${name}: invalid approved source ID`);
            continue;
          }
          if (typeof source.id !== 'string' || !source.id.trim()) {
            errors.push(`${name}: invalid approved source ID`);
            continue;
          } else if (sourceIds.has(source.id)) {
            errors.push(`${name}: duplicate approved source ID ${source.id}`);
          } else {
            sourceIds.add(source.id);
          }
          // Resolving the ID is insufficient when the cited record no longer
          // contains the open-source quote and rights evidence required by the
          // visuals-kit contract. Production audits also check stale dist/.
          const hasQuote = typeof source.quote === 'string' && source.quote.trim().length > 0;
          const hasSection = typeof source.section === 'string' && source.section.trim().length > 0;
          const hasPage = typeof source.url === 'string' &&
            source.url.startsWith(BODYPARTS3D_URL_PREFIX) &&
            source.url.length > BODYPARTS3D_URL_PREFIX.length;
          const hasDate = validRetrievedDay(source.retrieved);
          if (!hasQuote || !hasSection || !hasPage || !hasDate ||
              source.book !== 'BodyParts3D' || source.license !== 'CC BY 4.0') {
            errors.push(`${name}: approved source ${source.id} has incomplete or incompatible citation and rights evidence`);
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
          if (!label || typeof label.id !== 'string' || !STRUCTURE_ID.test(label.id)) {
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
          } else if (label.source !== `bp3d-${label.id}`) {
            // Each approved BodyParts3D label must cite its own reviewed ID.
            errors.push(`${name}: approved label ${label.id} source does not match structure ID`);
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
          if (!label || typeof label.id !== 'string' || !STRUCTURE_ID.test(label.id)) {
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

  // Inspect the entire output, not only dist/models/anatomy: a misplaced file is just as public.
  // The source manifest approves exact .glb URLs; any other 3D asset must be explicitly reviewed.
  const linked = [];
  const builtFiles = walkFiles(dist, linked);
  const toUrl = (path) => '/' + path.slice(dist.length + 1).replaceAll('\\', '/');
  for (const path of linked) errors.push(`symbolic link in production output: ${toUrl(path)}`);
  const shipped = [...new Set(builtFiles
    .filter((path) => MODEL_ASSET.test(path))
    .map(toUrl))];

  for (const url of shipped) {
    if (!approved.has(url)) errors.push(`unapproved model exposed in production: ${url}`);
  }
  for (const url of approved) {
    if (!shipped.includes(url)) errors.push(`approved model missing from production: ${url}`);
  }

  for (const path of builtFiles) {
    const url = toUrl(path);
    if (url.startsWith('/preview/anatomy-fixture/')) {
      errors.push(`test fixture exposed in production: ${url}`);
    }
  }

  // Draft labels must not be baked into static HTML/JS data, even if their .glb files were pruned.
  // The identifiers are original data keys, not guessed medical wording. Only match exact token boundaries.
  // Search every static text asset, including Pagefind/search data and other public routes.
  // Token boundaries avoid confusing BP24 with BP240 or FMA7198nsn with FMA7198nsn0. Unknown ID formats fail source validation above.
  const textFiles = builtFiles.filter((path) => TEXT_ASSET.test(path));
  const draftTokens = draftIds;
  for (const file of textFiles) {
    let contents;
    try {
      contents = readRegularFileNoFollow(file);
    } catch {
      errors.push(`cannot safely read built text: ${file.slice(dist.length + 1)}`);
      continue;
    }
    // Both the original bytes and their context-appropriate decoded versions
    // must be checked. This recognizes encoded IDs without erasing raw token boundaries.
    const variants = [contents];
    if (SCRIPT_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'script'));
    if (MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'markup'));
    // Inline <style> and style attributes in HTML/SVG can carry active CSS escapes too.
    if (CSS_ESCAPES_ASSET.test(file) || MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'css'));
    if (draftTokens.size) {
      let exposedDraft = null;
      for (const variant of variants) {
        for (const match of variant.matchAll(STRUCTURE_TOKEN)) {
          if (draftTokens.has(match[0])) {
            exposedDraft = match[0];
            break;
          }
        }
        if (exposedDraft) break;
      }
      if (exposedDraft) {
        errors.push('draft anatomy ID exposed in built text: ' + file.slice(dist.length + 1) + ' (' + exposedDraft + ')');
      }
    }
    // Reserved synthetic shape IDs are forbidden in public HTML, JS, and search
    // assets even if every real source record is approved.
    let exposedFixture = null;
    for (const variant of variants) {
      const match = /\bFIX\d{3,}\b/.exec(variant);
      if (match) {
        exposedFixture = match[0];
        break;
      }
    }
    if (exposedFixture) {
      errors.push('test fixture ID exposed in built text: ' + file.slice(dist.length + 1) + ' (' + exposedFixture + ')');
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
