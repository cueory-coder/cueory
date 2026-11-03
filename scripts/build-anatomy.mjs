/**
 * Builds the anatomy lab's 3D models from BodyParts3D (Task 177; D-58, D-80; docs/VISUALS.md, "3D body").
 *
 *   node scripts/build-anatomy.mjs --source <dir> --release <3.0|4.0> [--system <id>] [--retrieved YYYY-MM-DD]
 *                                  [--update-definitions]
 *
 * --source   a folder holding BodyParts3D's own files: parts_list_e.txt, conventional_part_of.txt, README_e.html and
 *            one mesh per structure named <structure id>.stl or <structure id>.obj (any subfolder). Treated as data
 *            only: nothing in it is ever run.
 * --release  3.0: the 2011-09-15 release, from the GitHub mirror Kevin-Mattheus-Moerman/BodyParts3D, whose README
 *            says it converted BodyParts3D_3.0_obj_95.zip to binary STL. 4.0: the official download (OBJ). Release 4.0
 *            also needs --retrieved, the day the files were downloaded.
 * --system   build only this system (default: every system in scripts/anatomy-systems.json).
 * --update-definitions  write the structure lists worked out from the hierarchy back into anatomy-systems.json.
 *            Without it the build stops when the hierarchy and the stored list disagree, so the list never drifts.
 *
 * For each system in scripts/anatomy-systems.json it:
 *   1. picks the structures from the database's own hierarchy: every concept under the system's root concepts in
 *      conventional_part_of.txt (BodyParts3D's "conventional" tree), skipping the listed exclusions, that has a mesh.
 *      The order is the tree's breadth-first order, ties in file order, so it is the same on every run;
 *   2. reads each mesh (binary STL or OBJ), joins identical corners, drops triangles that collapse to a line, and turns
 *      the database's coordinates into glTF's with one fixed change for every system, so the systems line up:
 *      BodyParts3D is in millimetres with +x the body's left, +y posterior and +z superior (coordinate_system.png);
 *      glTF is in metres with +y up and the model facing +z. So (x, y, z) mm becomes (x, z, -y) / 1000 m;
 *   3. hands one named node per structure (node name = structure id, e.g. FMA7204) to gltfpack, which adds normals,
 *      simplifies only when the system is over the phone budget (150,000 triangles, 3 MB; the same ratio for every
 *      structure, within gltfpack's default 1% error limit, so shapes are kept), and compresses with meshopt
 *      (EXT_meshopt_compression, D-58) with float positions (-vpf), so each structure stays one named mesh node;
 *   4. writes public/models/anatomy/<system>.glb, with the BodyParts3D credit as the file's copyright, and
 *      content/visuals/anatomy-<system>.json: one label per structure whose text is the parts list's English name
 *      exactly as written, cited to that line of parts_list_e.txt, and whose group (the lab's list heading) is a
 *      concept from the same hierarchy, chosen by scripts/anatomy-groups.mjs.
 * It prints the triangles of every structure before and after. The same input gives the same files, byte for byte.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pack } from 'gltfpack';
import { groupHeadings } from './anatomy-groups.mjs';

const SYSTEMS_FILE = 'scripts/anatomy-systems.json';
const MODELS_DIR = 'public/models/anatomy';
const VISUALS_DIR = 'content/visuals';

/** The phone budget (src/islands/bodyviewer-logic.ts, D-83). */
const MAX_TRIANGLES = 150_000;
const MAX_BYTES = 3 * 1024 * 1024;

/** BodyParts3D's license page (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html, updated 2025/02/27). */
const CREDIT = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International';

/**
 * The README sentence each model's depiction cites. Checked against the README in --source, so a release whose
 * README says something else stops the build instead of being cited wrongly.
 */
const README_QUOTE =
  'BodyParts3D is a dictionary-type database for anatomy in which shapes and positions of body parts are represented by 3D human models.';

const RELEASES = {
  '3.0': {
    label: 'BodyParts3D 3.0 (2011-09-15)',
    via: 'GitHub mirror Kevin-Mattheus-Moerman/BodyParts3D (OBJ converted to STL)',
    partsSection: 'parts_list_e.txt, Release 3.0 (2011-09-15)',
    readmeSection: 'README_e.html, Release 3.0 (2011-09-15)',
    url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html',
    retrieved: '2026-11-02',
  },
  '4.0': {
    label: 'BodyParts3D 4.0',
    via: 'official download from dbarchive.biosciencedbc.jp',
    partsSection: 'parts_list_e.txt, Release 4.0',
    readmeSection: 'README_e.html, Release 4.0',
    url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html',
    retrieved: undefined,
  },
};

function fail(message) {
  process.stderr.write(`build-anatomy: ${message}\n`);
  process.exit(1);
}

function parseArguments(argv) {
  const options = { system: undefined, source: undefined, release: undefined, retrieved: undefined, update: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) fail(`${arg} needs a value`);
      return next;
    };
    if (arg === '--source') options.source = value();
    else if (arg === '--release') options.release = value();
    else if (arg === '--system') options.system = value();
    else if (arg === '--retrieved') options.retrieved = value();
    else if (arg === '--update-definitions') options.update = true;
    else fail(`unknown argument ${arg} (see the top of scripts/build-anatomy.mjs)`);
  }
  if (!options.source) fail('--source <dir> is required');
  if (!RELEASES[options.release]) fail('--release must be 3.0 or 4.0');
  options.retrieved ??= RELEASES[options.release].retrieved;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.retrieved ?? '')) fail('--retrieved YYYY-MM-DD is required for this release');
  return options;
}

/** Every file under a folder, by file name. Two files with the same name stop the build: which one is meant? */
function indexFiles(dir) {
  const files = new Map();
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        if (files.has(entry.name)) fail(`two files are called ${entry.name}: ${files.get(entry.name)} and ${full}`);
        files.set(entry.name, full);
      }
    }
  };
  walk(dir);
  return files;
}

/** A tab-separated BodyParts3D table, without its header line. */
function table(path) {
  const lines = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n');
  return lines.slice(1).filter((line) => line.length > 0).map((line) => ({ line, cells: line.split('\t') }));
}

/** The structures of one system, worked out from the conventional tree. */
function resolveSystem(system, hierarchy, names, meshes) {
  for (const concept of [...system.roots, ...(system.exclude ?? [])]) {
    if (names.get(concept.id) !== concept.name) {
      fail(`${system.id}: ${concept.id} is "${names.get(concept.id)}" in the parts list, not "${concept.name}"`);
    }
  }
  const excluded = new Set((system.exclude ?? []).map((concept) => concept.id));
  const paths = new Map();
  const queue = system.roots.map((root) => [root.id, [root.id]]);
  while (queue.length > 0) {
    const [id, path] = queue.shift();
    if (paths.has(id) || excluded.has(id)) continue;
    paths.set(id, path);
    for (const part of hierarchy.parts.get(id) ?? []) queue.push([part, [...path, part]]);
  }
  const found = [...paths].filter(([id]) => meshes.has(id)).map(([id, path]) => ({ id, path }));
  // The list heading: the coarsest useful concept on the structure's path (scripts/anatomy-groups.mjs).
  let headings;
  try {
    headings = groupHeadings(found, system.roots.map((root) => root.id), hierarchy.parents);
  } catch (error) {
    fail(`${system.id}: ${error.message}`);
  }
  return found.map(({ id, path }) => ({
    id,
    name: names.get(id),
    group: names.get(headings.get(id)) ?? fail(`${system.id}: heading ${headings.get(id)} of ${id} is not in parts_list_e.txt`),
    path: path.map((step) => names.get(step)),
  }));
}

/** Binary STL: an 80-byte header, a triangle count, then 50 bytes per triangle (normal, three corners, 2 spare). */
function readStl(bytes, file) {
  const count = bytes.length >= 84 ? bytes.readUInt32LE(80) : -1;
  if (count < 0 || bytes.length !== 84 + 50 * count) fail(`${file} is not a binary STL file`);
  const corners = new Float32Array(count * 9);
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 9; k++) corners[t * 9 + k] = bytes.readFloatLE(84 + t * 50 + 12 + k * 4);
  }
  return corners;
}

/** Wavefront OBJ: "v x y z" corners and "f a b c ..." faces (1-based, negative counts back), fanned into triangles. */
function readObj(text, file) {
  const vertices = [];
  const corners = [];
  for (const raw of text.split('\n')) {
    const parts = raw.trim().split(/\s+/);
    if (parts[0] === 'v') vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    else if (parts[0] === 'f') {
      const face = parts.slice(1).map((corner) => {
        const n = Number.parseInt(corner.split('/')[0], 10);
        const vertex = vertices[n < 0 ? vertices.length + n : n - 1];
        if (!vertex || vertex.some((value) => !Number.isFinite(value))) fail(`${file} has a face with a bad corner: ${raw}`);
        return vertex;
      });
      for (let k = 1; k + 1 < face.length; k++) corners.push(...face[0], ...face[k], ...face[k + 1]);
    }
  }
  return new Float32Array(corners);
}

/** One structure's indexed mesh in glTF coordinates, with identical corners joined and collapsed triangles dropped. */
function indexMesh(corners) {
  const seen = new Map();
  const positions = [];
  const indices = [];
  for (let t = 0; t < corners.length; t += 9) {
    const triangle = [];
    for (let c = 0; c < 9; c += 3) {
      const x = corners[t + c];
      const y = corners[t + c + 1];
      const z = corners[t + c + 2];
      const key = `${x},${y},${z}`;
      let index = seen.get(key);
      if (index === undefined) {
        index = positions.length / 3;
        seen.set(key, index);
        positions.push(x / 1000, z / 1000, -y / 1000); // millimetres, z up -> metres, y up (see the top of this file)
      }
      triangle.push(index);
    }
    if (triangle[0] !== triangle[1] && triangle[1] !== triangle[2] && triangle[0] !== triangle[2]) indices.push(...triangle);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), sourceTriangles: corners.length / 9 };
}

/** A GLB file: 12-byte header, then the JSON chunk (padded with spaces) and the binary chunk (padded with zeros). */
function writeGlb(json, binary) {
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const chunks = [chunkHeader(text.length, 0x4e4f534a), text];
  if (binary) {
    const padded = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4, 0)]);
    chunks.push(chunkHeader(padded.length, 0x004e4942), padded);
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

function chunkHeader(length, type) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(length, 0);
  header.writeUInt32LE(type, 4);
  return header;
}

/** The JSON chunk and the binary chunk of a GLB file. */
function readGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) fail('gltfpack did not write a GLB 2 file');
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const rest = 20 + jsonLength;
  const binary = rest < bytes.length ? bytes.subarray(rest + 8, rest + 8 + bytes.readUInt32LE(rest)) : undefined;
  return { json, binary };
}

/** The uncompressed scene: one node per structure, named with its id, all sharing one neutral material. */
function sceneGlb(structures) {
  const accessors = [];
  const bufferViews = [];
  const meshes = [];
  const pieces = [];
  let offset = 0;
  const view = (array, target) => {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: array.byteLength, target });
    pieces.push(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    offset += array.byteLength;
    return bufferViews.length - 1;
  };
  for (const structure of structures) {
    const { positions, indices } = structure.mesh;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
      min[i % 3] = Math.min(min[i % 3], positions[i]);
      max[i % 3] = Math.max(max[i % 3], positions[i]);
    }
    accessors.push({ bufferView: view(positions, 34962), componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max });
    accessors.push({ bufferView: view(indices, 34963), componentType: 5125, count: indices.length, type: 'SCALAR' });
    meshes.push({
      name: structure.id,
      primitives: [{ attributes: { POSITION: accessors.length - 2 }, indices: accessors.length - 1, material: 0 }],
    });
  }
  const json = {
    asset: { version: '2.0', copyright: CREDIT },
    scene: 0,
    scenes: [{ nodes: structures.map((_, i) => i) }],
    nodes: structures.map((structure, i) => ({ name: structure.id, mesh: i })),
    meshes,
    materials: [{ name: 'tissue', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  return writeGlb(json, Buffer.concat(pieces));
}

/** Runs gltfpack in memory (its npm package is the WebAssembly build of the same tool). */
async function gltfpack(input, ratio) {
  const files = new Map([['scene.glb', input]]);
  const args = ['-i', 'scene.glb', '-o', 'packed.glb', '-cc', '-kn', '-vpf', '-gn', '60'];
  if (ratio < 1) args.push('-si', ratio.toFixed(6));
  await pack(args, {
    read: (path) => {
      const name = basename(path);
      if (!files.has(name)) throw new Error(`gltfpack asked for ${path}`);
      return files.get(name);
    },
    write: (path, data) => files.set(basename(path), Buffer.from(data)),
  });
  const packed = files.get('packed.glb');
  if (!packed) fail('gltfpack wrote no file');
  // gltfpack writes its own asset block; put the credit back as the file's copyright. The binary chunk is unchanged.
  const { json, binary } = readGlb(packed);
  json.asset = { ...json.asset, copyright: CREDIT };
  const bytes = writeGlb(json, binary);
  const triangles = new Map();
  for (const node of json.nodes) {
    if (node.mesh === undefined) fail(`gltfpack wrote node "${node.name}" without a mesh`);
    const count = json.meshes[node.mesh].primitives.reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);
    triangles.set(node.name, count);
  }
  return { bytes, triangles, total: [...triangles.values()].reduce((a, b) => a + b, 0) };
}

/** Simplifies only when needed, lowering the ratio until the system fits the phone budget. */
async function packWithinBudget(system, input) {
  let ratio = 1;
  let packed = await gltfpack(input, ratio);
  for (let attempt = 0; packed.total > MAX_TRIANGLES || packed.bytes.length > MAX_BYTES; attempt++) {
    if (attempt === 8) {
      fail(
        `${system.id} does not fit the phone budget (${packed.total} triangles, ${packed.bytes.length} bytes) within ` +
          "gltfpack's 1% error limit: split it into smaller systems in scripts/anatomy-systems.json",
      );
    }
    ratio *= Math.min(MAX_TRIANGLES / packed.total, MAX_BYTES / packed.bytes.length) * 0.98;
    packed = await gltfpack(input, ratio);
  }
  return { ...packed, ratio };
}

/** The visual's source file, with every label and source on one line, as the other files in content/visuals. */
function visualJson(visual) {
  const line = (object) =>
    `{ ${Object.entries(object).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(', ')} }`;
  const list = (items) => (items.length === 0 ? '[]' : `[\n${items.map((item) => `    ${line(item)}`).join(',\n')}\n  ]`);
  const fields = Object.entries(visual).map(([key, value]) => {
    if (Array.isArray(value) && typeof value[0] === 'object') return `  ${JSON.stringify(key)}: ${list(value)}`;
    if (Array.isArray(value)) return `  ${JSON.stringify(key)}: [${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    if (value && typeof value === 'object') return `  ${JSON.stringify(key)}: ${line(value)}`;
    return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  });
  return `{\n${fields.join(',\n')}\n}\n`;
}

function visualFor(system, structures, partsLines, release, retrieved) {
  return {
    id: `anatomy-${system.id}`,
    title: system.title,
    kind: 'model',
    lessonIds: system.lessonIds,
    status: 'draft',
    model: { file: `/models/anatomy/${system.id}.glb`, release: release.label, via: release.via },
    labels: structures.map((s) => ({ id: s.id, text: s.name, group: s.group, source: `bp3d-${s.id}` })),
    depictions: [
      {
        id: 'geometry',
        what: "each structure's 3D shape and position as BodyParts3D models it, all in the database's one shared body coordinate system",
        source: 'bp3d-readme',
      },
    ],
    sources: [
      { id: 'bp3d-readme', quote: README_QUOTE, book: 'BodyParts3D', section: release.readmeSection, url: release.url, license: 'CC BY 4.0', retrieved },
      ...structures.map((s) => ({
        id: `bp3d-${s.id}`,
        quote: partsLines.get(s.id).replaceAll('\t', ' '),
        book: 'BodyParts3D',
        section: release.partsSection,
        url: release.url,
        license: 'CC BY 4.0',
        retrieved,
      })),
    ],
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const release = RELEASES[options.release];
  if (!existsSync(options.source) || !statSync(options.source).isDirectory()) fail(`${options.source} is not a folder`);
  const files = indexFiles(options.source);
  const need = (name) => files.get(name) ?? fail(`${name} is not in ${options.source}`);

  const readme = readFileSync(need('README_e.html'), 'utf8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  if (!readme.includes(README_QUOTE)) fail(`README_e.html does not say: ${README_QUOTE}`);

  const names = new Map();
  const partsLines = new Map();
  for (const { line, cells } of table(need('parts_list_e.txt'))) {
    if (cells.length !== 2) fail(`parts_list_e.txt has a line that isn't "id<tab>name": ${line}`);
    names.set(cells[0], cells[1]);
    partsLines.set(cells[0], line);
  }
  const hierarchy = { parts: new Map(), parents: new Map() };
  for (const { cells } of table(need('conventional_part_of.txt'))) {
    const [whole, , part] = cells;
    if (!hierarchy.parts.has(whole)) hierarchy.parts.set(whole, []);
    hierarchy.parts.get(whole).push(part);
    if (!hierarchy.parents.has(part)) hierarchy.parents.set(part, []);
    hierarchy.parents.get(part).push(whole);
  }
  const meshes = new Map();
  for (const [name, path] of files) {
    const extension = extname(name).toLowerCase();
    if (extension !== '.stl' && extension !== '.obj') continue;
    const id = name.slice(0, -extension.length);
    if (meshes.has(id)) fail(`${id} has both an STL and an OBJ mesh; keep one`);
    meshes.set(id, path);
  }

  const definitions = JSON.parse(readFileSync(SYSTEMS_FILE, 'utf8'));
  const chosen = definitions.systems.filter((system) => !options.system || system.id === options.system);
  if (chosen.length === 0) fail(`no system called ${options.system} in ${SYSTEMS_FILE}`);

  let changed = false;
  for (const system of chosen) {
    const structures = resolveSystem(system, hierarchy, names, meshes);
    const ids = structures.map((s) => s.id);
    if (JSON.stringify(ids) !== JSON.stringify(system.structures)) {
      if (!options.update) {
        fail(`${system.id}: the hierarchy gives a different structure list than ${SYSTEMS_FILE}; run with --update-definitions and review the change`);
      }
      system.structures = ids;
      changed = true;
    }

    for (const structure of structures) {
      const path = meshes.get(structure.id);
      const bytes = readFileSync(path);
      structure.mesh = indexMesh(extname(path).toLowerCase() === '.stl' ? readStl(bytes, path) : readObj(bytes.toString('utf8'), path));
    }
    const sourceTotal = structures.reduce((sum, s) => sum + s.mesh.indices.length / 3, 0);
    const packed = await packWithinBudget(system, sceneGlb(structures));

    mkdirSync(MODELS_DIR, { recursive: true });
    writeFileSync(join(MODELS_DIR, `${system.id}.glb`), packed.bytes);
    writeFileSync(join(VISUALS_DIR, `anatomy-${system.id}.json`), visualJson(visualFor(system, structures, partsLines, release, options.retrieved)));

    process.stdout.write(
      `\n${system.id}: ${structures.length} structures, ${sourceTotal} -> ${packed.total} triangles ` +
        `(ratio ${packed.ratio === 1 ? '1, not simplified' : packed.ratio.toFixed(4)}), ${packed.bytes.length} bytes\n`,
    );
    for (const s of structures) {
      process.stdout.write(`  ${s.id}\t${s.mesh.indices.length / 3} -> ${packed.triangles.get(s.id)}\t${s.name}\t[${s.path.join(' > ')}]\n`);
    }
  }
  if (changed) writeFileSync(SYSTEMS_FILE, `${JSON.stringify(definitions, null, 2)}\n`);
}

await main();
