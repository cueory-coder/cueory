import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../../content/lessons/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('lesson content files', () => {
  it('has at least one lesson', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s has unique sentence ids and a matching file name', (file) => {
    const lesson = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    expect(lesson.id).toBe(file.replace(/\.json$/, ''));
    const ids = lesson.sentences.map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

const cardsDir = new URL('../../content/cards/', import.meta.url);
const cardFiles = readdirSync(cardsDir).filter((f) => f.endsWith('.json'));

describe('card content files', () => {
  it.each(cardFiles)('%s has unique card ids and belongs to a lesson that exists', (file) => {
    const deck = JSON.parse(readFileSync(new URL(file, cardsDir), 'utf8'));
    expect(deck.id).toBe(file.replace(/\.json$/, ''));
    expect(files).toContain(`${deck.lesson}.json`);
    const ids = deck.cards.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
