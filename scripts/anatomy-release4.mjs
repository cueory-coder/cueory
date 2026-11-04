/**
 * Reads BodyParts3D Release 4.0's own download files (Task 177 follow-up), for scripts/build-anatomy.mjs. Tested in
 * tests/unit/anatomy-release4.test.ts with small hand-made files in the formats the README describes.
 *
 * What the 4.0 README (README_e.html, page dated 2025/02/27) says, and what this file relies on:
 *   - 2.3 partof_parts_list_e.txt, "Table of 3D organ model IDs and organ names (PART-OF Tree)": tab-delimited, columns
 *     "concept id", "representation id", "en". (2.2 is the IS-A Tree's isa_parts_list_e.txt.)
 *   - 2.5 partof_inclusion_relation_list.txt: tab-delimited, columns "parent id", "parent name", "child id",
 *     "child name". (2.4 is isa_inclusion_relation_list.txt.)
 *   - 2.7 partof_element_parts.txt, "Data describing the definition of compound organs": tab-delimited, columns
 *     "concept id", "name", "element file id". "In BodyParts3D, only atomic organs (ELEMENT) are constructed as polygon
 *     meshes"; compound organs are sums of them. (2.6 is isa_element_parts.txt.)
 *   - 2.9 partof_BP3D_4.0_obj_99.zip: "multiple files of ELEMENT file ID-specific polygon data in Wavefront OBJ format".
 *     (2.8 is isa_BP3D_4.0_obj_99.zip.)
 *
 * ASSUMPTIONS the README does not confirm. Each is checked against the real files, and the build stops with a plain
 * message naming the file and line when one turns out wrong:
 *   A1. A table's first line is either its column names exactly as the README lists them (a header) or a data row
 *       whose first cell is a concept id like FMA7088; anything else stops the build.
 *   A2. Concept ids look like FMA7088 (letters FMA, digits, optional suffix such as "nsn", as in Release 3.0).
 *   A3. Each OBJ file inside the zip is named <element file id>.obj (in any folder of the zip).
 *   A4. A compound organ's rows in *_element_parts.txt list every element it is made of, including its parts'
 *       elements, so an element listed under several concepts of one system belongs to the most specific of them,
 *       which must be part of (below) all the others in the inclusion tree.
 *   A5. The zip is an ordinary zip file (no ZIP64, entries stored or deflated).
 *   A6. The meshes use Release 3.0's coordinates: millimetres, +x the body's left, +y posterior, +z superior
 *       (Release 3.0's coordinate_system.png). The 4.0 README says nothing about units or axes, so the build checks that
 *       sizes look like millimetres and that a skeleton system is tallest along z.
 */
import { crc32, inflateRawSync } from 'node:zlib';

/** The README's column names for each table, in order. */
export const COLUMNS = {
  parts: ['concept id', 'representation id', 'en'],
  inclusion: ['parent id', 'parent name', 'child id', 'child name'],
  elements: ['concept id', 'name', 'element file id'],
};

/** The release's file names for a tree ("partof" or "isa"), as the README lists them. */
export function release4Files(tree) {
  if (tree !== 'partof' && tree !== 'isa') throw new Error(`the tree is "partof" or "isa", not "${tree}"`);
  return {
    readme: 'README_e.html',
    parts: `${tree}_parts_list_e.txt`,
    inclusion: `${tree}_inclusion_relation_list.txt`,
    elements: `${tree}_element_parts.txt`,
    zip: `${tree}_BP3D_4.0_obj_99.zip`,
  };
}

const CONCEPT_ID = /^FMA\d+[A-Za-z0-9_-]*$/; // A2

/**
 * One tab-delimited table: its data rows as { line, cells, number } (number counts from 1, the file's own line).
 * Stops (throws) on a line with the wrong number of cells, and on a first line that is neither the README's header
 * nor a data row (A1).
 */
export function readTable(text, columns, file) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const rows = [];
  lines.forEach((line, i) => {
    if (line.length === 0) return;
    const cells = line.split('\t');
    if (i === 0 && rows.length === 0) {
      const lower = cells.map((cell) => cell.trim().toLowerCase());
      if (lower.length === columns.length && lower.every((cell, k) => cell === columns[k])) return; // the header (A1)
      if (!CONCEPT_ID.test(cells[0] ?? '')) {
        throw new Error(
          `${file} line 1 is neither the README's column names (${columns.join(', ')}) nor a row starting with a concept id like FMA7088: ${line}`,
        );
      }
    }
    if (cells.length !== columns.length) {
      throw new Error(`${file} line ${i + 1} has ${cells.length} columns, not the README's ${columns.length} (${columns.join(', ')}): ${line}`);
    }
    rows.push({ line, cells, number: i + 1 });
  });
  if (rows.length === 0) throw new Error(`${file} has no rows`);
  return rows;
}

const MAX_ENTRY_BYTES = 64 * 1_048_576;

/**
 * The files in a zip, by file name (the last part of the path), each read only when asked for. Stops on ZIP64, an
 * unknown compression method, a damaged entry or two entries with the same file name (A5).
 * @param {Buffer} bytes
 * @param {string} file the zip's name, for messages
 * @returns {Map<string, () => Buffer>}
 */
export function readZip(bytes, file) {
  const fail = (what) => {
    throw new Error(`${file}: ${what}`);
  };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) fail('is not a zip file (no end-of-directory record)');
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  const start = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) fail('is a ZIP64 file, which this script does not read');
  if (start + size > end) fail('is damaged (its file directory lies outside the file)');
  if (count * 46 > size) fail('is damaged (its entry count does not fit its file directory)');
  const dirEnd = start + size;
  const entries = new Map();
  let at = start;
  for (let n = 0; n < count; n++) {
    if (at + 46 > dirEnd || bytes.readUInt32LE(at) !== 0x02014b50) fail(`directory entry ${n + 1} is damaged`);
    const method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16);
    const compressed = bytes.readUInt32LE(at + 20);
    const uncompressed = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    if (at + 46 + nameLength + extraLength + commentLength > dirEnd) fail(`directory entry ${n + 1} is damaged`);
    const path = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    at += 46 + nameLength + extraLength + commentLength;
    if (path.endsWith('/')) continue; // a folder
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || local === 0xffffffff) fail(`${path} needs ZIP64`);
    if (method !== 0 && method !== 8) fail(`${path} uses compression method ${method}; only stored (0) and deflated (8) are read`);
    const name = path.split('/').pop();
    if (entries.has(name)) fail(`two entries are called ${name}`);
    entries.set(name, () => {
      if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) fail(`${path}: its local header is damaged`);
      const dataStart = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      if (dataStart + compressed > start) fail(`${path} is damaged (its data runs past the end of the file)`);
      if (uncompressed > MAX_ENTRY_BYTES) fail(`${path} is too large (over ${MAX_ENTRY_BYTES / 1_048_576} MB unpacked)`);
      const raw = bytes.subarray(dataStart, dataStart + compressed);
      let data;
      try {
        data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.max(uncompressed, 1) });
      } catch {
        fail(`${path} is damaged (it cannot be unpacked, or is larger than its listed size)`);
      }
      if (data.length !== uncompressed || crc32(data) !== crc) fail(`${path} is damaged (its size or checksum is wrong)`);
      return data;
    });
  }
  return entries;
}

/**
 * The release's tables, read into the shapes the build uses.
 * @param {{ parts: string, inclusion: string, elements: string }} texts the three tables' contents
 * @param {{ parts: string, inclusion: string, elements: string }} files their names, for messages
 */
export function readRelease4Tables(texts, files) {
  const names = new Map();
  const partsLines = new Map();
  for (const { line, cells, number } of readTable(texts.parts, COLUMNS.parts, files.parts)) {
    const [id, , name] = cells;
    if (!CONCEPT_ID.test(id)) throw new Error(`${files.parts} line ${number}: "${id}" is not a concept id like FMA7088`);
    if (partsLines.has(id)) throw new Error(`${files.parts} line ${number}: ${id} is listed twice`);
    names.set(id, name);
    partsLines.set(id, line);
  }
  const hierarchy = { parts: new Map(), parents: new Map() };
  const otherNames = new Map();
  for (const { cells, number } of readTable(texts.inclusion, COLUMNS.inclusion, files.inclusion)) {
    const [parent, parentName, child, childName] = cells;
    for (const id of [parent, child]) {
      if (!CONCEPT_ID.test(id)) throw new Error(`${files.inclusion} line ${number}: "${id}" is not a concept id like FMA7088`);
    }
    if (!hierarchy.parts.has(parent)) hierarchy.parts.set(parent, []);
    hierarchy.parts.get(parent).push(child);
    if (!hierarchy.parents.has(child)) hierarchy.parents.set(child, []);
    hierarchy.parents.get(child).push(parent);
    if (!otherNames.has(parent)) otherNames.set(parent, parentName);
    if (!otherNames.has(child)) otherNames.set(child, childName);
  }
  const elements = new Map();
  for (const { cells, number } of readTable(texts.elements, COLUMNS.elements, files.elements)) {
    const [id, name, element] = cells;
    if (!CONCEPT_ID.test(id)) throw new Error(`${files.elements} line ${number}: "${id}" is not a concept id like FMA7088`);
    if (!/^[A-Za-z0-9_-]+$/.test(element)) throw new Error(`${files.elements} line ${number}: "${element}" is not an element file id`);
    if (!elements.has(id)) elements.set(id, []);
    if (!elements.get(id).includes(element)) elements.get(id).push(element);
    if (!otherNames.has(id)) otherNames.set(id, name);
  }
  // A concept outside the parts list (a grouping concept such as a system root) is named by the other two tables.
  for (const [id, name] of otherNames) if (!names.has(id)) names.set(id, name);
  return { names, partsLines, hierarchy, elements };
}

/** True when `a` is part of `b`, directly or through other concepts, in the inclusion tree. */
function isBelow(a, b, parents) {
  const queue = [...(parents.get(a) ?? [])];
  const seen = new Set();
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === b) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(parents.get(next) ?? []));
  }
  return false;
}

/**
 * The structures of one system in Release 4.0: every concept under the system's roots (breadth-first, ties in file
 * order, skipping exclusions) that owns at least one element. An element belongs to the most specific concept of the
 * system that lists it (A4), so each element is drawn once and a compound organ that has elements of its own, such
 * as a chamber with its own wall, comes out as a structure next to its parts.
 * @returns {Array<{ id: string, path: string[], elements: string[] }>}
 */
export function resolveSystem4(system, data) {
  const excluded = new Set((system.exclude ?? []).map((concept) => concept.id));
  /** Breadth-first from the roots (ties in file order), optionally stepping over the exclusions. */
  const walk = (skip) => {
    const found = new Map();
    const queue = system.roots.map((root) => [root.id, [root.id]]);
    while (queue.length > 0) {
      const [id, path] = queue.shift();
      if (found.has(id) || (skip && excluded.has(id))) continue;
      found.set(id, path);
      for (const part of data.hierarchy.parts.get(id) ?? []) queue.push([part, [...path, part]]);
    }
    return found;
  };
  // A compound concept lists the elements of its parts too, so an excluded part's elements are also listed by its
  // whole. Owners are therefore worked out over every concept, and the ones an exclusion owns are then dropped.
  const paths = walk(false);
  const kept = walk(true);
  const listedBy = new Map();
  for (const id of paths.keys()) {
    for (const element of data.elements.get(id) ?? []) {
      if (!listedBy.has(element)) listedBy.set(element, []);
      listedBy.get(element).push(id);
    }
  }
  const owned = new Map();
  for (const [element, concepts] of listedBy) {
    // The most specific listing concept: the one no other listing concept is below. A system with several roots can
    // list an element under concepts that are not on one line (a root such as "heart" lists the elements of the right
    // side of the heart, which the tree puts elsewhere), so of those, the one deepest in the system's own walk wins.
    // Two equally deep concepts (a muscle and a layer of the same wall can share one mesh) go to the one the walk
    // reaches first, which is the same on every run.
    const lowest = concepts.filter((c) => !concepts.some((other) => other !== c && isBelow(other, c, data.hierarchy.parents)));
    const depth = Math.max(...lowest.map((c) => paths.get(c).length));
    const owner = [...paths.keys()].find((c) => lowest.includes(c) && paths.get(c).length === depth);
    if (!owned.has(owner)) owned.set(owner, []);
    owned.get(owner).push(element);
  }
  return [...kept]
    .filter(([id]) => owned.has(id))
    .map(([id, path]) => ({ id, path, elements: owned.get(id).sort() }));
}

/**
 * Checks one system's meshes against assumption A6 and throws a plain message when they don't look like Release
 * 3.0's millimetres with +z up.
 * @param {string} systemId
 * @param {{ min: number[], max: number[] }} box the system's extent in the files' own coordinates
 */
export function checkCoordinates(systemId, box) {
  const size = [0, 1, 2].map((k) => box.max[k] - box.min[k]);
  const far = Math.max(...box.min.map(Math.abs), ...box.max.map(Math.abs));
  const advice = "check the 4.0 README and the files' coordinates, then change the conversion in scripts/build-anatomy.mjs";
  if (Math.max(...size) < 20 || far > 5000) {
    throw new Error(`${systemId} is ${size.map((s) => s.toFixed(1)).join(' × ')} units: not millimetres as in Release 3.0 (A6); ${advice}`);
  }
  if (systemId.startsWith('skeleton-') && !(size[2] > size[0] && size[2] > size[1])) {
    throw new Error(`${systemId} is not tallest along z (${size.map((s) => s.toFixed(0)).join(' × ')} mm): +z may not be up (A6); ${advice}`);
  }
}
