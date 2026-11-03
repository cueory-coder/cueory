import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkCoordinates,
  COLUMNS,
  readRelease4Tables,
  readTable,
  readZip,
  release4Files,
  resolveSystem4,
} from '../../scripts/anatomy-release4.mjs';
import { glbNodeNames } from '../../src/visuals/sources';

/**
 * BodyParts3D Release 4.0's download files (scripts/anatomy-release4.mjs), tested with small hand-made files in the
 * formats the 4.0 README describes. Every id and name here is a placeholder ("sample ..."), not anatomy and not from
 * BodyParts3D.
 */

const tsv = (rows: string[][]) => `${rows.map((row) => row.join('\t')).join('\n')}\n`;

/** A zip file: stored or deflated entries, written the way the zip format describes (no ZIP64). */
function zip(entries: Array<{ path: string; data: Buffer; deflate?: boolean; badCrc?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path);
    const body = entry.deflate ? deflateRawSync(entry.data) : entry.data;
    const crc = entry.badCrc ? (crc32(entry.data) ^ 1) >>> 0 : crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A small OBJ: one triangle 30 mm across and 60 mm tall (in the files' own millimetres, +z up), moved by `dx`. */
const obj = (dx: number) =>
  Buffer.from(`# sample\nv ${dx} 0 0\nv ${dx + 30} 0 0\nv ${dx} 10 60\nvn 0 1 0\nf 1//1 2//1 3//1\n`);

/**
 * A sample release: R (the system's root) is made of C and Q, and C of P. C has one element of its own (E1) besides
 * its part's (E2), like a compound organ with a mesh of its own; R lists every element, as a compound organ does.
 */
const tables = {
  parts: tsv([
    COLUMNS.parts,
    ['FMA90001', 'BP90001', 'sample root'],
    ['FMA90002', 'BP90002', 'sample chamber'],
    ['FMA90003', 'BP90003', 'sample part'],
    ['FMA90004', 'BP90004', 'sample other part'],
  ]),
  inclusion: tsv([
    COLUMNS.inclusion,
    ['FMA90000', 'sample body', 'FMA90001', 'sample root'],
    ['FMA90001', 'sample root', 'FMA90002', 'sample chamber'],
    ['FMA90001', 'sample root', 'FMA90004', 'sample other part'],
    ['FMA90002', 'sample chamber', 'FMA90003', 'sample part'],
  ]),
  elements: tsv([
    COLUMNS.elements,
    ['FMA90001', 'sample root', 'E1'],
    ['FMA90001', 'sample root', 'E2'],
    ['FMA90001', 'sample root', 'E3'],
    ['FMA90002', 'sample chamber', 'E1'],
    ['FMA90002', 'sample chamber', 'E2'],
    ['FMA90003', 'sample part', 'E2'],
    ['FMA90004', 'sample other part', 'E3'],
  ]),
};
const files = release4Files('partof');
const system = { id: 'sample', roots: [{ id: 'FMA90001', name: 'sample root' }], exclude: [] };

describe('Release 4.0 file names', () => {
  it("are the README's, for either tree", () => {
    expect(release4Files('partof')).toEqual({
      readme: 'README_e.html',
      parts: 'partof_parts_list_e.txt',
      inclusion: 'partof_inclusion_relation_list.txt',
      elements: 'partof_element_parts.txt',
      zip: 'partof_BP3D_4.0_obj_99.zip',
    });
    expect(release4Files('isa').zip).toBe('isa_BP3D_4.0_obj_99.zip');
    expect(() => release4Files('other')).toThrow('"partof" or "isa"');
  });
});

describe('reading a 4.0 table', () => {
  it("skips the README's column names as a header, or reads from the first line when there is none", () => {
    expect(readTable(tables.parts, COLUMNS.parts, 'p.txt').map((row) => row.cells[0])).toEqual(['FMA90001', 'FMA90002', 'FMA90003', 'FMA90004']);
    const noHeader = tsv([['FMA90001', 'BP90001', 'sample root']]);
    expect(readTable(noHeader, COLUMNS.parts, 'p.txt')).toEqual([{ line: 'FMA90001\tBP90001\tsample root', cells: ['FMA90001', 'BP90001', 'sample root'], number: 1 }]);
    expect(readTable(`﻿${tables.parts.replace(/\n/g, '\r\n')}`, COLUMNS.parts, 'p.txt')).toHaveLength(4);
  });

  it('stops with a plain message when the file is not in the described format', () => {
    expect(() => readTable(tsv([['id', 'something', 'else'], ['FMA1', 'x', 'y']]), COLUMNS.parts, 'p.txt')).toThrow(
      "p.txt line 1 is neither the README's column names (concept id, representation id, en)",
    );
    expect(() => readTable(tsv([COLUMNS.parts, ['FMA1', 'sample']]), COLUMNS.parts, 'p.txt')).toThrow(
      "p.txt line 2 has 2 columns, not the README's 3",
    );
    expect(() => readTable('\n', COLUMNS.parts, 'p.txt')).toThrow('p.txt has no rows');
  });
});

describe('reading the 4.0 zip', () => {
  it('finds OBJ files by name in any folder, stored or deflated', () => {
    const bytes = zip([
      { path: 'partof_BP3D_4.0_obj_99/', data: Buffer.alloc(0) },
      { path: 'partof_BP3D_4.0_obj_99/E1.obj', data: obj(0) },
      { path: 'E2.obj', data: obj(40), deflate: true },
    ]);
    const entries = readZip(bytes, 'z.zip');
    expect([...entries.keys()]).toEqual(['E1.obj', 'E2.obj']);
    expect(entries.get('E2.obj')!().toString()).toBe(obj(40).toString());
  });

  it('stops on a damaged entry, two entries with one name, or a file that is not a zip', () => {
    expect(() => readZip(zip([{ path: 'E1.obj', data: obj(0), badCrc: true }]), 'z.zip').get('E1.obj')!()).toThrow('z.zip: E1.obj is damaged');
    expect(() => readZip(zip([{ path: 'a/E1.obj', data: obj(0) }, { path: 'b/E1.obj', data: obj(0) }]), 'z.zip')).toThrow('two entries are called E1.obj');
    expect(() => readZip(Buffer.alloc(100), 'z.zip')).toThrow('z.zip: is not a zip file');
  });

  it('stops with a plain message on a zip whose offsets or sizes do not fit the file', () => {
    const good = () => zip([{ path: 'E1.obj', data: obj(40), deflate: true }]);
    const patch = (edit: (b: Buffer, end: number, dir: number) => void) => {
      const b = good();
      const end = b.length - 22;
      edit(b, end, b.readUInt32LE(end + 16));
      return b;
    };
    const plain = (b: Buffer) => () => readZip(b, 'z.zip').get('E1.obj')!();
    expect(plain(good().subarray(0, good().length - 10))).toThrow('z.zip: is not a zip file');
    expect(plain(patch((b, end) => b.writeUInt32LE(b.length + 1000, end + 16)))).toThrow('z.zip: is damaged (its file directory');
    expect(plain(patch((b, end) => b.writeUInt16LE(500, end + 10)))).toThrow('z.zip: is damaged (its entry count');
    expect(plain(patch((b, _end, dir) => b.writeUInt32LE(b.length * 2, dir + 42)))).toThrow('z.zip: E1.obj: its local header is damaged');
    expect(plain(patch((b, _end, dir) => b.writeUInt32LE(b.length * 2, dir + 20)))).toThrow('z.zip: E1.obj is damaged (its data runs past');
    expect(plain(patch((b, _end, dir) => b.writeUInt32LE(3, dir + 24)))).toThrow('z.zip: E1.obj is damaged (it cannot be unpacked');
    expect(plain(patch((b, _end, dir) => b.writeUInt32LE(100 * 1_048_576, dir + 24)))).toThrow('z.zip: E1.obj is too large');
    expect(plain(patch((b, _end, dir) => b.writeUInt32LE(obj(40).length + 5, dir + 24)))).toThrow('z.zip: E1.obj is damaged (its size or checksum');
  });
});

describe('the structures of a system in 4.0', () => {
  const data = readRelease4Tables(tables, files);

  it('names concepts from the parts list, and grouping concepts from the inclusion list', () => {
    expect(data.names.get('FMA90002')).toBe('sample chamber');
    expect(data.names.get('FMA90000')).toBe('sample body');
    expect(data.partsLines.get('FMA90003')).toBe('FMA90003\tBP90003\tsample part');
    expect(data.partsLines.has('FMA90000')).toBe(false);
  });

  it('gives each element to the most specific concept, so a compound organ with its own mesh is a structure too', () => {
    expect(resolveSystem4(system, data)).toEqual([
      { id: 'FMA90002', path: ['FMA90001', 'FMA90002'], elements: ['E1'] },
      { id: 'FMA90004', path: ['FMA90001', 'FMA90004'], elements: ['E3'] },
      { id: 'FMA90003', path: ['FMA90001', 'FMA90002', 'FMA90003'], elements: ['E2'] },
    ]);
  });

  it('leaves out an excluded concept, everything under it, and the elements its compound whole lists for it', () => {
    const without = resolveSystem4({ ...system, exclude: [{ id: 'FMA90002', name: 'sample chamber' }] }, data);
    // E1 and E2 belong to the excluded chamber and its part; the root lists them too, but does not take them over.
    expect(without.map((s) => [s.id, s.elements])).toEqual([['FMA90004', ['E3']]]);
  });

  it('gives an element listed on two lines of the tree to the deeper concept, then to the one the walk reaches first', () => {
    // E2 is under the part (depth 3) and the other part (depth 2), neither inside the other: the deeper wins.
    const twice = readRelease4Tables({ ...tables, elements: `${tables.elements}FMA90004\tsample other part\tE2\n` }, files);
    expect(resolveSystem4(system, twice).map((s) => [s.id, s.elements])).toEqual([
      ['FMA90002', ['E1']],
      ['FMA90004', ['E3']],
      ['FMA90003', ['E2']],
    ]);
    // E3 under the chamber too: the chamber and the other part are equally deep, so the one reached first keeps it.
    const tie = readRelease4Tables({ ...tables, elements: `${tables.elements}FMA90002\tsample chamber\tE3\n` }, files);
    expect(resolveSystem4(system, tie).map((s) => [s.id, s.elements])).toEqual([
      ['FMA90002', ['E1', 'E3']],
      ['FMA90003', ['E2']],
    ]);
  });
});

describe('the 4.0 coordinates check', () => {
  it('passes millimetres with a skeleton tallest along z, and stops otherwise', () => {
    expect(() => checkCoordinates('sample', { min: [0, 0, 0], max: [30, 10, 60] })).not.toThrow();
    expect(() => checkCoordinates('sample', { min: [0, 0, 0], max: [0.3, 0.1, 1.6] })).toThrow('not millimetres');
    expect(() => checkCoordinates('skeleton-axial', { min: [0, 0, 0], max: [1600, 300, 400] })).toThrow('not tallest along z');
    expect(() => checkCoordinates('skeleton-axial', { min: [0, 0, 0], max: [400, 300, 1600] })).not.toThrow();
  });
});

describe('building from a 4.0 download, end to end', () => {
  const script = fileURLToPath(new URL('../../scripts/build-anatomy.mjs', import.meta.url));
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  /** A repository folder with one sample system, and a download folder with the README's file names. */
  function setUp(zipEntries: Array<{ path: string; data: Buffer; deflate?: boolean }>) {
    const repo = mkdtempSync(join(tmpdir(), 'cueory-bp3d4-repo-'));
    const download = mkdtempSync(join(tmpdir(), 'cueory-bp3d4-files-'));
    folders.push(repo, download);
    mkdirSync(join(repo, 'scripts'));
    mkdirSync(join(repo, 'content', 'visuals'), { recursive: true });
    const definitions = { systems: [{ ...system, title: 'sample system', lessonIds: ['U01-T01-L01'], structures: [] }] };
    writeFileSync(join(repo, 'scripts', 'anatomy-systems.json'), JSON.stringify(definitions));
    writeFileSync(
      join(download, 'README_e.html'),
      '<p>The dictionary-type database for anatomy in which anatomical concepts are represented by 3D structure data</p>',
    );
    writeFileSync(join(download, files.parts), tables.parts);
    writeFileSync(join(download, files.inclusion), tables.inclusion);
    writeFileSync(join(download, files.elements), tables.elements);
    writeFileSync(join(download, files.zip), zip(zipEntries));
    const run = (...extra: string[]) =>
      spawnSync(process.execPath, [script, '--source', download, '--release', '4.0', '--retrieved', '2026-11-20', ...extra], {
        cwd: repo,
        encoding: 'utf8',
        timeout: 60_000,
      });
    return { repo, download, run };
  }

  it('reads the tables and the zip in one command, and writes the model and its source file', () => {
    const { repo, run } = setUp([
      { path: 'partof_BP3D_4.0_obj_99/E1.obj', data: obj(0) },
      { path: 'partof_BP3D_4.0_obj_99/E2.obj', data: obj(40), deflate: true },
      { path: 'partof_BP3D_4.0_obj_99/E3.obj', data: obj(80), deflate: true },
    ]);
    // Without --update-definitions it stops: the stored list (empty) differs from what the files give.
    const first = run();
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('run with --update-definitions');
    const result = run('--update-definitions');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const glb = new Uint8Array(readFileSync(join(repo, 'public', 'models', 'anatomy', 'sample.glb')));
    expect(glbNodeNames(glb)).toEqual(['FMA90002', 'FMA90004', 'FMA90003']);
    const visual = JSON.parse(readFileSync(join(repo, 'content', 'visuals', 'anatomy-sample.json'), 'utf8'));
    expect(visual.model).toEqual({ file: '/models/anatomy/sample.glb', release: 'BodyParts3D 4.0', via: 'official download from dbarchive.biosciencedbc.jp' });
    expect(visual.labels).toEqual([
      { id: 'FMA90002', text: 'sample chamber', group: 'sample root', layer: 'organs', source: 'bp3d-FMA90002' },
      { id: 'FMA90004', text: 'sample other part', group: 'sample root', layer: 'organs', source: 'bp3d-FMA90004' },
      { id: 'FMA90003', text: 'sample part', group: 'sample root', layer: 'organs', source: 'bp3d-FMA90003' },
    ]);
    const source = visual.sources.find((s: { id: string }) => s.id === 'bp3d-FMA90002');
    expect(source).toMatchObject({ quote: 'FMA90002 BP90002 sample chamber', section: 'partof_parts_list_e.txt, Release 4.0', retrieved: '2026-11-20' });
    const stored = JSON.parse(readFileSync(join(repo, 'scripts', 'anatomy-systems.json'), 'utf8'));
    expect(stored.systems[0].structures).toEqual(['FMA90002', 'FMA90004', 'FMA90003']);
  });

  it('builds a second system from the IS-A tree in another folder, drawing no element twice', () => {
    const { repo, download, run } = setUp([
      { path: 'partof_BP3D_4.0_obj_99/E1.obj', data: obj(0) },
      { path: 'partof_BP3D_4.0_obj_99/E2.obj', data: obj(40) },
      { path: 'partof_BP3D_4.0_obj_99/E3.obj', data: obj(80) },
    ]);
    // The IS-A folder: the same sample tables under the isa_ names. The second system takes the whole sample tree,
    // so the first system (which comes first in the file) keeps E1 and E2 and the second gets only E3.
    const isa = mkdtempSync(join(tmpdir(), 'cueory-bp3d4-isa-'));
    folders.push(isa);
    const isaFiles = release4Files('isa');
    writeFileSync(join(isa, isaFiles.parts), tables.parts);
    writeFileSync(join(isa, isaFiles.inclusion), tables.inclusion);
    writeFileSync(join(isa, isaFiles.elements), tables.elements);
    writeFileSync(
      join(isa, isaFiles.zip),
      zip([
        { path: 'isa_BP3D_4.0_obj_99/E1.obj', data: obj(0) },
        { path: 'isa_BP3D_4.0_obj_99/E2.obj', data: obj(40) },
        { path: 'isa_BP3D_4.0_obj_99/E3.obj', data: obj(80) },
      ]),
    );
    const definitions = JSON.parse(readFileSync(join(repo, 'scripts', 'anatomy-systems.json'), 'utf8'));
    definitions.systems[0].roots = [{ id: 'FMA90003', name: 'sample part', why: 'sample' }];
    definitions.systems.push({ ...definitions.systems[0], id: 'sample2', tree: 'isa', roots: [{ id: 'FMA90001', name: 'sample root', why: 'sample' }] });
    definitions.layers = {
      order: [
        { id: 'muscle', title: 'muscle', concepts: [{ id: 'FMA90004', name: 'sample other part', tree: 'isa' }] },
        { id: 'organs', title: 'organs', concepts: [] },
      ],
    };
    writeFileSync(join(repo, 'scripts', 'anatomy-systems.json'), JSON.stringify(definitions));
    expect(download).toBeTruthy();
    const result = run('--isa-source', isa, '--update-definitions');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const one = new Uint8Array(readFileSync(join(repo, 'public', 'models', 'anatomy', 'sample.glb')));
    const two = new Uint8Array(readFileSync(join(repo, 'public', 'models', 'anatomy', 'sample2.glb')));
    expect(glbNodeNames(one)).toEqual(['FMA90003']);
    expect(glbNodeNames(two)).toEqual(['FMA90002', 'FMA90004']);
    const visual = JSON.parse(readFileSync(join(repo, 'content', 'visuals', 'anatomy-sample2.json'), 'utf8'));
    expect(visual.labels.map((l: { id: string; layer: string }) => [l.id, l.layer])).toEqual([
      ['FMA90002', 'organs'],
      ['FMA90004', 'muscle'],
    ]);
    expect(visual.sources.find((x: { id: string }) => x.id === 'bp3d-FMA90004').section).toBe('isa_parts_list_e.txt, Release 4.0');
  });

  it('stops with a plain message when the zip lacks an element the tables name', () => {
    const { run } = setUp([{ path: 'E1.obj', data: obj(0) }, { path: 'E3.obj', data: obj(80) }]);
    const result = run('--update-definitions');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('partof_BP3D_4.0_obj_99.zip has no E2.obj');
  });

  it('refuses --tree for Release 3.0', () => {
    const result = spawnSync(process.execPath, [script, '--source', tmpdir(), '--release', '3.0', '--tree', 'isa'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--tree is for Release 4.0 only');
  });
});
