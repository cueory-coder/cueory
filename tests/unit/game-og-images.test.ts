import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_OG_IMAGES } from '../../src/islands/share';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  let offset = 8;
  const chunks: { type: string; data: Buffer }[] = [];

  while (offset < bytes.length) {
    expect(offset + 12).toBeLessThanOrEqual(bytes.length);
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    expect(crcEnd).toBeLessThanOrEqual(bytes.length);

    const typeBytes = bytes.subarray(typeStart, dataStart);
    const data = bytes.subarray(dataStart, dataEnd);
    expect(bytes.readUInt32BE(dataEnd)).toBe(crc32(Buffer.concat([typeBytes, data])));
    chunks.push({ type: typeBytes.toString('ascii'), data });
    offset = crcEnd;
  }

  expect(offset).toBe(bytes.length);
  expect(chunks.map(({ type }) => type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  expect(chunks[0]?.data.length).toBe(13);
  expect(chunks.at(-1)?.data.length).toBe(0);
  return {
    width: chunks[0]!.data.readUInt32BE(0),
    height: chunks[0]!.data.readUInt32BE(4),
  };
}

function gamePreview(path: string): Buffer {
  return readFileSync(new URL(`../../public${path}`, import.meta.url));
}

describe('static game Open Graph previews', () => {
  it('gives every results-card game a distinct stable file', () => {
    expect(Object.keys(GAME_OG_IMAGES).sort()).toEqual(['cueword', 'hello-cards', 'pulse', 'sudoku', 'suture']);
    expect(new Set(Object.values(GAME_OG_IMAGES)).size).toBe(5);
  });

  it.each(Object.entries(GAME_OG_IMAGES))('%s is a valid 1200 by 630 PNG', (_game, path) => {
    expect(inspectPng(gamePreview(path))).toEqual({ width: 1200, height: 630 });
  });

  it('keeps each score-free game preview visually distinct', () => {
    const hashes = Object.values(GAME_OG_IMAGES).map((path) =>
      createHash('sha256').update(gamePreview(path)).digest('hex'),
    );
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('sets each crawlable game route to its own preview', () => {
    const routes = {
      pulse: 'src/pages/play/pillo.astro',
      cueword: 'src/pages/play/crossword.astro',
      suture: 'src/pages/play/word-path.astro',
      sudoku: 'src/pages/play/sudoku.astro',
      'hello-cards': 'src/pages/play/hello-cards.astro',
    } as const;
    for (const [game, file] of Object.entries(routes)) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
      if (game === 'hello-cards') expect(source).toContain('/share/hello-cards-og.png');
      else expect(source.includes(`GAME_OG_IMAGES['${game}']`) || source.includes(`GAME_OG_IMAGES.${game}`)).toBe(true);
    }
  });
});
