/**
 * The anatomy lab's test model (Task 178): a few boxes and one eight-sided shape, built in code as a tiny .glb so the
 * unit and browser tests run before the real BodyParts3D models exist. It is deliberately not anatomy: its structures
 * are named "fixture cube A" and so on in tests/fixtures/anatomy-fixture.json.
 *
 * Served only by non-production builds, at /preview/anatomy-fixture/fixture.glb
 * (src/pages/preview/anatomy-fixture/[name].glb.ts). Plain TypeScript with no dependencies, so the same bytes come out
 * of every build.
 */

interface Shape {
  /** The mesh node's name: the structure id in the fixture's JSON. */
  name: string;
  positions: number[];
  normals: number[];
  indices: number[];
}

function box(name: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Shape {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  // Six faces, four corners each, so every face has its own flat normal.
  const faces: Array<[number[], number[], number[]]> = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const half = [sx / 2, sy / 2, sz / 2];
  for (const [n, u, v] of faces) {
    const base = positions.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p = [0, 1, 2].map((i) => (n[i]! + a * u[i]! + b * v[i]!) * half[i]!);
      positions.push(cx + p[0]!, cy + p[1]!, cz + p[2]!);
      normals.push(n[0]!, n[1]!, n[2]!);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { name, positions, normals, indices };
}

function octahedron(name: string, cx: number, cy: number, cz: number, r: number): Shape {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const tips = { px: [r, 0, 0], nx: [-r, 0, 0], py: [0, r, 0], ny: [0, -r, 0], pz: [0, 0, r], nz: [0, 0, -r] };
  const faces = [
    [tips.px, tips.py, tips.pz], [tips.py, tips.nx, tips.pz], [tips.nx, tips.ny, tips.pz], [tips.ny, tips.px, tips.pz],
    [tips.py, tips.px, tips.nz], [tips.nx, tips.py, tips.nz], [tips.ny, tips.nx, tips.nz], [tips.px, tips.ny, tips.nz],
  ];
  for (const face of faces) {
    const base = positions.length / 3;
    const sum = [0, 1, 2].map((i) => face[0]![i]! + face[1]![i]! + face[2]![i]!);
    const length = Math.hypot(sum[0]!, sum[1]!, sum[2]!);
    for (const corner of face) {
      positions.push(cx + corner[0]!, cy + corner[1]!, cz + corner[2]!);
      normals.push(sum[0]! / length, sum[1]! / length, sum[2]! / length);
    }
    indices.push(base, base + 1, base + 2);
  }
  return { name, positions, normals, indices };
}

/** The fixture's shapes, in its own units (like BodyParts3D's millimetres). FIX001 sits in the middle of the view. */
export function fixtureShapes(): Shape[] {
  return [
    box('FIX001', 0, 0, 0, 40, 40, 40),
    box('FIX002', 70, 0, 0, 30, 30, 30),
    box('FIX003', -70, 0, 0, 30, 50, 30),
    octahedron('FIX004', 0, 60, 0, 20),
    box('FIX005', 0, -60, 0, 60, 16, 24),
  ];
}

const pad4 = (n: number) => (n + 3) & ~3;

/** The fixture model as .glb bytes (glTF 2.0 binary: a 12-byte header, a JSON chunk and a BIN chunk). */
export function fixtureGlb(): Uint8Array<ArrayBuffer> {
  const shapes = fixtureShapes();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const add = (bytes: Uint8Array, target: number) => {
    const length = bytes.byteLength;
    chunks.push(bytes);
    const padded = pad4(length);
    if (padded > length) chunks.push(new Uint8Array(padded - length));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: length, target });
    offset += padded;
    return bufferViews.length - 1;
  };
  const meshes = shapes.map((shape) => {
    const pos = new Float32Array(shape.positions);
    const nor = new Float32Array(shape.normals);
    const idx = new Uint16Array(shape.indices);
    const min = [0, 1, 2].map((i) => Math.min(...shape.positions.filter((_, k) => k % 3 === i)));
    const max = [0, 1, 2].map((i) => Math.max(...shape.positions.filter((_, k) => k % 3 === i)));
    const posView = add(new Uint8Array(pos.buffer), 34962);
    accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
    const posAccessor = accessors.length - 1;
    const norView = add(new Uint8Array(nor.buffer), 34962);
    accessors.push({ bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    const norAccessor = accessors.length - 1;
    const idxView = add(new Uint8Array(idx.buffer), 34963);
    accessors.push({ bufferView: idxView, componentType: 5123, count: idx.length, type: 'SCALAR' });
    return { name: shape.name, primitives: [{ attributes: { POSITION: posAccessor, NORMAL: norAccessor }, indices: accessors.length - 1 }] };
  });
  const gltf = {
    asset: { version: '2.0', generator: 'cueory anatomy lab test fixture' },
    scene: 0,
    scenes: [{ nodes: shapes.map((_, i) => i) }],
    nodes: shapes.map((shape, i) => ({ name: shape.name, mesh: i })),
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = pad4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonLength + 8 + offset;
  const out = new Uint8Array(new ArrayBuffer(total));
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength); // JSON is padded with spaces
  view.setUint32(20 + jsonLength, offset, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true); // "BIN"
  let at = 28 + jsonLength;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
