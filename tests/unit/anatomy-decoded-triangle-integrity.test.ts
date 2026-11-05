import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Only reads the existing BodyParts3D files. No anatomy status or model is changed.
const systems = [
  'digestive', 'heart', 'kidneys', 'lungs', 'muscle', 'nerves',
  'nervous', 'skeleton-axial', 'skeleton-limbs', 'skin', 'vessels',
] as const;

type Point = readonly [number, number, number];
interface Compression {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  count: number;
  byteStride: number;
  mode: string;
  filter?: string;
}
interface BufferView {
  byteStride?: number;
  extensions?: { EXT_meshopt_compression?: Compression };
}
interface Accessor {
  bufferView: number;
  byteOffset?: number;
  count: number;
  componentType: number;
  type: string;
}
interface Model {
  bufferViews: BufferView[];
  accessors: Accessor[];
  meshes: Array<{ primitives: Array<{ indices: number; attributes: { POSITION: number }; mode?: number }> }>;
}
interface DecodedView { data: DataView; stride: number }

/** Fail if a structure's indices are invalid or it contains no drawable triangle. */
function checkTriangles(
  count: number,
  vertexCount: number,
  readIndex: (index: number) => number,
  readPosition: (index: number) => Point,
): void {
  if (!Number.isSafeInteger(count) || count < 3 || count % 3 !== 0 ||
      !Number.isSafeInteger(vertexCount) || vertexCount < 3) {
    throw new Error('invalid triangle or vertex count');
  }
  // Check all decoded POSITION vertices, including those in later triangles.
  // Finding one drawable triangle must not hide NaN/Infinity elsewhere.
  for (let index = 0; index < vertexCount; index++) {
    if (!readPosition(index).every(Number.isFinite)) {
      throw new Error('non-finite POSITION coordinate');
    }
  }
  let drawable = false;
  for (let n = 0; n < count; n += 3) {
    const a = readIndex(n);
    const b = readIndex(n + 1);
    const c = readIndex(n + 2);
    if ([a, b, c].some((index) => !Number.isSafeInteger(index) || index < 0 || index >= vertexCount)) {
      throw new Error('triangle index outside the POSITION accessor');
    }
    if (drawable || a === b || a === c || b === c) continue;
    const p = readPosition(a);
    const q = readPosition(b);
    const r = readPosition(c);
    if (![...p, ...q, ...r].every(Number.isFinite)) {
      throw new Error('non-finite triangle coordinates');
    }
    const ux = q[0] - p[0];
    const uy = q[1] - p[1];
    const uz = q[2] - p[2];
    const vx = r[0] - p[0];
    const vy = r[1] - p[1];
    const vz = r[2] - p[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    drawable = cx * cx + cy * cy + cz * cz > 0;
  }
  if (!drawable) throw new Error('mesh has no nondegenerate triangle');
}

/** Decode the actual compressed data referenced by each glTF bufferView. */
function assertCompressedRange(byteOffset: number, byteLength: number, binLength: number): void {
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 ||
      !Number.isSafeInteger(byteLength) || byteLength <= 0 ||
      !Number.isSafeInteger(binLength) || binLength < 0 ||
      byteOffset > binLength || byteLength > binLength - byteOffset) {
    throw new Error('compressed payload outside GLB BIN chunk');
  }
}

/** Decode the actual compressed data referenced by each glTF bufferView. */
function decodeViews(bytes: Buffer, model: Model, binOffset: number, binLength: number): DecodedView[] {
  return model.bufferViews.map((view) => {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (!ext || ext.buffer !== 0) throw new Error('uncompressed or external geometry');
    const relativeOffset = ext.byteOffset ?? 0;
    assertCompressedRange(relativeOffset, ext.byteLength, binLength);
    if (!Number.isSafeInteger(ext.count) || ext.count <= 0 ||
        !Number.isSafeInteger(ext.byteStride) || ext.byteStride <= 0 ||
        !Number.isSafeInteger(ext.count * ext.byteStride)) {
      throw new Error('invalid compressed output dimensions');
    }
    const sourceOffset = binOffset + relativeOffset;
    const source = bytes.subarray(sourceOffset, sourceOffset + ext.byteLength);
    if (source.length !== ext.byteLength) throw new Error('truncated compressed payload');
    const output = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      output, ext.count, ext.byteStride, source, ext.mode, ext.filter ?? 'NONE',
    );
    return { data: new DataView(output.buffer, output.byteOffset, output.byteLength), stride: view.byteStride ?? ext.byteStride };
  });
}

function readIndex(view: DecodedView, accessor: Accessor, index: number): number {
  const offset = (accessor.byteOffset ?? 0) + index * view.stride;
  if (accessor.componentType === 5121) return view.data.getUint8(offset);
  if (accessor.componentType === 5123) return view.data.getUint16(offset, true);
  if (accessor.componentType === 5125) return view.data.getUint32(offset, true);
  throw new Error('unrecognized index component type ' + accessor.componentType);
}

function readPosition(view: DecodedView, accessor: Accessor, index: number): Point {
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') {
    throw new Error('POSITION is not FLOAT VEC3');
  }
  const offset = (accessor.byteOffset ?? 0) + index * view.stride;
  return [
    view.data.getFloat32(offset, true),
    view.data.getFloat32(offset + 4, true),
    view.data.getFloat32(offset + 8, true),
  ];
}

/** glTF mode defaults to 4 (TRIANGLES); index data must be unsigned SCALAR. */
function checkTrianglePrimitive(mode: number | undefined, indices: Accessor, positions: Accessor): void {
  if (mode !== undefined && mode !== 4) throw new Error('primitive rendering mode is not TRIANGLES');
  if (indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType)) {
    throw new Error('triangle indices must use unsigned SCALAR accessors');
  }
  if (positions.type !== 'VEC3' || positions.componentType !== 5126) {
    throw new Error('triangle POSITION must use FLOAT VEC3');
  }
}

describe('real BodyParts3D decoded triangles', () => {
  it('rejects line/strip rendering modes and non-SCALAR triangle indices', () => {
    const indices: Accessor = { bufferView: 0, count: 3, componentType: 5123, type: 'SCALAR' };
    const positions: Accessor = { bufferView: 1, count: 3, componentType: 5126, type: 'VEC3' };
    expect(() => checkTrianglePrimitive(undefined, indices, positions)).not.toThrow();
    expect(() => checkTrianglePrimitive(4, indices, positions)).not.toThrow();
    expect(() => checkTrianglePrimitive(1, indices, positions)).toThrow('not TRIANGLES');
    expect(() => checkTrianglePrimitive(5, indices, positions)).toThrow('not TRIANGLES');
    expect(() => checkTrianglePrimitive(undefined, { ...indices, type: 'VEC3' }, positions))
      .toThrow('unsigned SCALAR');
    expect(() => checkTrianglePrimitive(undefined, { ...indices, componentType: 5126 }, positions))
      .toThrow('unsigned SCALAR');
    expect(() => checkTrianglePrimitive(undefined, indices, { ...positions, type: 'SCALAR' }))
      .toThrow('FLOAT VEC3');
  });
  it('rejects compressed bufferViews that escape the declared GLB BIN chunk', () => {
    // Bytes exist after the BIN chunk, but they are not part of its payload.
    // The range check must use the chunk boundary, not only Buffer.length.
    const bytes = Buffer.alloc(40);
    const model: Model = {
      bufferViews: [{
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0, byteOffset: 1, byteLength: 4, count: 1,
            byteStride: 4, mode: 'ATTRIBUTES',
          },
        },
      }],
      accessors: [],
      meshes: [],
    };
    expect(() => decodeViews(bytes, model, 28, 4))
      .toThrow('compressed payload outside GLB BIN chunk');
    expect(() => assertCompressedRange(0, 4, 4)).not.toThrow();
  });
  it('rejects out-of-range indices and fully degenerate synthetic meshes', () => {
    const vertices: Point[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
    expect(() => checkTriangles(3, 3, (i) => [0, 1, 3][i]!, (i) => vertices[i]!))
      .toThrow('triangle index outside');
    expect(() => checkTriangles(3, 3, (i) => [0, 1, 2][i]!, () => [0, 0, 0]))
      .toThrow('no nondegenerate triangle');
    expect(() => checkTriangles(3, 3, (i) => [0, 1, 2][i]!, (i) => vertices[i]!))
      .not.toThrow();
    // A valid first triangle must not make a later corrupt vertex invisible to QA.
    const withNonFinite: Point[] = [...vertices, [Number.NaN, 0, 0]];
    expect(() => checkTriangles(6, 4, (i) => [0, 1, 2, 0, 3, 2][i]!, (i) => withNonFinite[i]!))
      .toThrow('non-finite POSITION coordinate');
  });

  it('checks every indexed primitive in all eleven decoded models', async () => {
    await MeshoptDecoder.ready;
    let totalTriangles = 0;
    let checkedPrimitives = 0;
    for (const system of systems) {
      const bytes = readFileSync(new URL('../../public/models/anatomy/' + system + '.glb', import.meta.url));
      expect(bytes.toString('ascii', 0, 4), system).toBe('glTF');
      expect(bytes.readUInt32LE(4), system).toBe(2);
      expect(bytes.readUInt32LE(8), system).toBe(bytes.length);
      const jsonLength = bytes.readUInt32LE(12);
      expect(bytes.readUInt32LE(16), system).toBe(0x4e4f534a);
      const binHeaderOffset = 20 + jsonLength;
      expect(binHeaderOffset + 8, system).toBeLessThanOrEqual(bytes.length);
      const binLength = bytes.readUInt32LE(binHeaderOffset);
      expect(bytes.readUInt32LE(binHeaderOffset + 4), system).toBe(0x004e4942);
      const binOffset = binHeaderOffset + 8;
      expect(binOffset + binLength, system).toBeLessThanOrEqual(bytes.length);
      const model = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as Model;
      const views = decodeViews(bytes, model, binOffset, binLength);
      let systemTriangles = 0;
      for (const [meshIndex, mesh] of model.meshes.entries()) {
        expect(mesh.primitives.length, system + ' mesh ' + meshIndex).toBeGreaterThan(0);
        for (const primitive of mesh.primitives) {
          const indices = model.accessors[primitive.indices];
          const positions = model.accessors[primitive.attributes.POSITION];
          expect(indices, system + ' mesh ' + meshIndex + ' indices').toBeDefined();
          expect(positions, system + ' mesh ' + meshIndex + ' positions').toBeDefined();
          checkTrianglePrimitive(primitive.mode, indices!, positions!);
          const indexView = views[indices!.bufferView];
          const positionView = views[positions!.bufferView];
          expect(indexView, system + ' index view').toBeDefined();
          expect(positionView, system + ' POSITION view').toBeDefined();
          try {
            checkTriangles(
              indices!.count,
              positions!.count,
              (i) => readIndex(indexView!, indices!, i),
              (i) => readPosition(positionView!, positions!, i),
            );
          } catch (error) {
            throw new Error(system + ': mesh ' + meshIndex + ': ' + (error instanceof Error ? error.message : String(error)));
          }
          systemTriangles += indices!.count / 3;
          checkedPrimitives += 1;
        }
      }
      expect(systemTriangles, system + ' has drawable triangles').toBeGreaterThan(0);
      totalTriangles += systemTriangles;
    }
    expect(checkedPrimitives).toBeGreaterThan(0);
    expect(totalTriangles).toBeGreaterThan(0);
  }, 30_000);
});
