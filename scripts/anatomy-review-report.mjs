/**
 * Read-only anatomy model review inventory (Task 178).
 *
 * Prints the labels and source lines that already exist in content/visuals/anatomy-*.json.
 * This is evidence for a HUMAN visual/clinical and rights review, never automatic approval.
 * No dependencies, network requests, model rendering, content edits, or publication changes.
 *
 * Usage:
 *   node scripts/anatomy-review-report.mjs --system heart > /tmp/heart-review.md
 *   node scripts/anatomy-review-report.mjs > /tmp/all-anatomy-review.md
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYSTEM_FILE = /^anatomy-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const MODEL_PATH = /^\/models\/anatomy\/[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;
const BODY_PARTS_SOURCE_PREFIX = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['skin', 'muscle', 'nerves', 'vessels', 'organs', 'skeleton'];

function requireText(value, description) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${description} must be nonempty text`);
  return value;
}

function markdownCell(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function safeLink(value, name) {
  const url = requireText(value, name);
  if (!/^https:\/\/[^\s)\]]+$/i.test(url)) throw new Error(`${name} must be a safe HTTPS URL`);
  let parsed;
  try { parsed = new URL(url); }
  catch { throw new Error(`${name} must be a safe HTTPS URL`); }
  // Check the parsed origin and normalized path, not only the raw string.
  // A raw prefix check accepts /bodyparts3d/../other and encoded dot-segments.
  // The current Release 4.0 archive is CC BY 4.0, but older archived
  // releases (such as 20110915) carry different rights notices.
  // Require the reviewed LATEST release path before presenting a CC BY citation.
  const official = new URL(BODY_PARTS_SOURCE_PREFIX);
  if (
    parsed.origin !== official.origin ||
    !parsed.pathname.startsWith(official.pathname) ||
    parsed.pathname.length === official.pathname.length ||
    // Source records use literal public archive paths. Refuse escaped path bytes
    // so encoded slashes/dot segments cannot be reinterpreted downstream.
    parsed.pathname.includes('%') ||
    parsed.username || parsed.password || parsed.port
  ) {
    throw new Error(`${name} must link to the official BodyParts3D source`);
  }
  return url;
}

/**
 * Read source records, enforce basic inventory integrity, and report file sizes without opening or editing GLBs.
 * The existing anatomy-models tests remain the authority for actual GLB node/triangle validation.
 * @param {string} root Repository root
 * @param {string | null} selectedSystem Optional filename-derived system ID
 */
export function anatomyInventory(root = DEFAULT_ROOT, selectedSystem = null) {
  if (selectedSystem !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selectedSystem)) {
    throw new Error('system must be a lowercase anatomy file ID, such as heart or skeleton-axial');
  }
  const content = join(resolve(root), 'content', 'visuals');
  const paths = readdirSync(content).filter((file) => SYSTEM_FILE.test(file)).sort();
  const chosen = selectedSystem === null ? paths : paths.filter((p) => SYSTEM_FILE.exec(p)?.[1] === selectedSystem);
  if (!chosen.length) throw new Error(selectedSystem ? `No anatomy source file for ${selectedSystem}` : 'No anatomy source files found');
  const globalIds = new Set();
  const entries = [];
  for (const file of chosen) {
    const id = SYSTEM_FILE.exec(file)[1];
    const fail = (message) => { throw new Error(`${file}: ${message}`); };
    let visual;
    try { visual = JSON.parse(readFileSync(join(content, file), 'utf8')); }
    catch { fail('could not read a JSON source file'); }
    if (!visual || typeof visual !== 'object' || Array.isArray(visual)) fail('must contain an object');
    if (visual.kind !== 'model') fail('kind must be model');
    if (visual.status !== 'draft' && visual.status !== 'approved') fail('status must be draft or approved');
    if (!visual.model || !MODEL_PATH.test(visual.model.file)) fail('model.file must be a local /models/anatomy/*.glb path');
    const modelPath = join(resolve(root), 'public', visual.model.file.slice(1));
    if (!existsSync(modelPath)) fail(`model file missing: ${visual.model.file}`);
    const modelBytes = statSync(modelPath).size;
    if (!Array.isArray(visual.sources) || !Array.isArray(visual.labels) || !visual.labels.length) {
      fail('must have nonempty labels and a sources list');
    }
    const sources = new Map();
    for (const source of visual.sources) {
      if (!source || typeof source !== 'object') fail('source record must be an object');
      const sourceId = requireText(source.id, `${file} source id`);
      if (sources.has(sourceId)) fail(`source id repeated: ${sourceId}`);
      safeLink(source.url, `${file} source ${sourceId} URL`);
      if (source.book !== 'BodyParts3D' || source.license !== 'CC BY 4.0') {
        fail(`source ${sourceId} must cite BodyParts3D under CC BY 4.0`);
      }
      sources.set(sourceId, source);
    }
    const labels = visual.labels.map((label, index) => {
      if (!label || typeof label !== 'object') fail(`label ${index + 1} must be an object`);
      const labelId = requireText(label.id, `${file} label id`);
      if (globalIds.has(labelId)) fail(`structure id repeated: ${labelId}`);
      globalIds.add(labelId);
      const name = requireText(label.text, `${file} label ${labelId} name`);
      const source = sources.get(label.source);
      if (!source) fail(`label ${labelId} has no cited source`);
      requireText(source.quote, `${file} label ${labelId} source quote`);
      requireText(source.section, `${file} label ${labelId} source section`);
      requireText(source.book, `${file} label ${labelId} source book`);
      requireText(source.license, `${file} label ${labelId} source license`);
      if (!ORDER.includes(label.layer)) fail(`label ${labelId} has no recognized layer`);
      return { id: labelId, name, group: label.group || 'ungrouped', layer: label.layer, source };
    });
    entries.push({
      id,
      title: requireText(visual.title, `${file} title`),
      status: visual.status,
      release: requireText(visual.model.release, `${file} model release`),
      path: visual.model.file,
      bytes: modelBytes,
      labels,
    });
  }
  return entries;
}

/** Markdown for manual inspection. No model or teaching content is authored by this script. */
export function anatomyReviewMarkdown(entries) {
  const total = entries.reduce((n, entry) => n + entry.labels.length, 0);
  const lines = [
    '# Anatomy lab: model review inventory',
    '',
    '> Review aid only. The labels and source lines below are copied from existing anatomy source files. This report',
    '> does not verify anatomy geometry or approve a draft for student use.',
    '',
    `Systems: **${entries.length}**. Listed structures: **${total}**.`,
    '',
    '| System | Review status | Release | Structures | Model size |',
    '| --- | --- | --- | ---: | ---: |',
  ];
  for (const entry of entries) {
    lines.push(`| ${markdownCell(entry.title)} | ${entry.status} | ${markdownCell(entry.release)} | ${entry.labels.length} | ${(entry.bytes / 1024).toFixed(1)} KiB |`);
  }
  for (const entry of entries) {
    lines.push('', `## ${markdownCell(entry.title)} (${entry.id})`, '',
      `Status: **${entry.status}**. Model: \`${entry.path}\`. Release: ${markdownCell(entry.release)}.`, '',
      '### Layers', '', '| Layer | Structures |', '| --- | ---: |');
    for (const layer of ORDER) {
      const count = entry.labels.filter((label) => label.layer === layer).length;
      if (count) lines.push(`| ${layer} | ${count} |`);
    }
    lines.push('', '### Official names and their cited source lines', '',
      '| # | Structure ID | Official name | Group | Layer | Source quote | Source record |',
      '| ---: | --- | --- | --- | --- | --- | --- |');
    for (const [index, label] of entry.labels.entries()) {
      const source = label.source;
      lines.push(`| ${index + 1} | ${markdownCell(label.id)} | ${markdownCell(label.name)} | ${markdownCell(label.group)} | ${label.layer} | ${markdownCell(source.quote)} | [${markdownCell(source.book)}, ${markdownCell(source.section)}](${source.url}) · ${markdownCell(source.license)} |`);
    }
    lines.push('', '### Human review before approval', '',
      '- [ ] Check the model visually against the original BodyParts3D reference.',
      '- [ ] Check the cited names, grouping and layer placement for students.',
      '- [ ] Confirm licensing and attribution in the viewer and exported pictures.',
      '- [ ] Confirm any placeholder lesson links are corrected before release.',
      '- [ ] Keep the source status as `draft` until the founder approves publication.', '');
  }
  return `${lines.join('\n')}\n`;
}

function cli(args) {
  let selectedSystem = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--system' && args[i + 1]) {
      if (selectedSystem !== null) throw new Error('Only one --system is allowed');
      selectedSystem = args[++i];
    } else if (args[i] === '--help') {
      return 'Usage: node scripts/anatomy-review-report.mjs [--system heart]\nPrints Markdown; redirect it to a .md file if desired.\n';
    } else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  return anatomyReviewMarkdown(anatomyInventory(DEFAULT_ROOT, selectedSystem));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(cli(process.argv.slice(2))); }
  catch (err) { process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`); process.exitCode = 1; }
}
