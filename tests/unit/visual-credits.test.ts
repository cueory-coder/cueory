import { describe, expect, it } from 'vitest';
import { creditsFor } from '../../src/visuals/credits';
import { allowedBooks, type AllowedBook, type Visual } from '../../src/visuals/sources';

// ── helpers ──────────────────────────────────────────────────────────────────

const BOOK_A = allowedBooks[0].book; // 'Open RN Nursing Fundamentals 2e'

function makeSource(id: string, book: string = BOOK_A) {
  return { id, quote: 'sample', book, section: 'sample', url: `https://wtcs.pressbooks.pub/nursingfundamentals/${id}`, license: 'CC BY 4.0', retrieved: '2026-11-01' };
}

function makeVisual(sources: ReturnType<typeof makeSource>[]): Pick<Visual, 'sources'> {
  return { sources };
}

// A fake second book for ordering tests (not in allowedBooks — used only where we
// pass a custom books array).
const BOOK_B: AllowedBook = {
  book: 'Test Book B',
  urlPrefix: 'https://example.invalid/',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  credit: 'Test Book B credit',
};

const CUSTOM_BOOKS: readonly AllowedBook[] = [allowedBooks[0], BOOK_B];

// ── creditsFor ────────────────────────────────────────────────────────────────

describe('creditsFor', () => {
  it('returns an empty array for an empty visuals list', () => {
    expect(creditsFor([])).toEqual([]);
  });

  it('returns an empty array for a visual with no sources', () => {
    expect(creditsFor([makeVisual([])])).toEqual([]);
  });

  it('returns one credit entry for a single visual quoting one book', () => {
    const result = creditsFor([makeVisual([makeSource('s1')])]);
    expect(result).toHaveLength(1);
    expect(result[0].book).toBe(BOOK_A);
  });

  it('returns each book only once even when the same book is quoted by multiple sources', () => {
    const visual = makeVisual([makeSource('s1'), makeSource('s2'), makeSource('s3')]);
    expect(creditsFor([visual])).toHaveLength(1);
  });

  it('returns each book only once across multiple visuals quoting the same book', () => {
    const a = makeVisual([makeSource('s1')]);
    const b = makeVisual([makeSource('s2')]);
    expect(creditsFor([a, b])).toHaveLength(1);
  });

  it('returns books in first-appearance order across visuals', () => {
    const first = makeVisual([makeSource('s1', BOOK_A)]);
    const second = makeVisual([makeSource('s2', BOOK_B.book)]);
    const result = creditsFor([first, second], CUSTOM_BOOKS);
    expect(result.map((b) => b.book)).toEqual([BOOK_A, BOOK_B.book]);
  });

  it('first-appearance order: book B before book A when B appears first', () => {
    const first = makeVisual([makeSource('s1', BOOK_B.book)]);
    const second = makeVisual([makeSource('s2', BOOK_A)]);
    const result = creditsFor([first, second], CUSTOM_BOOKS);
    expect(result.map((b) => b.book)).toEqual([BOOK_B.book, BOOK_A]);
  });

  it('returns two credits when two different books are quoted', () => {
    const visual = makeVisual([makeSource('s1', BOOK_A), makeSource('s2', BOOK_B.book)]);
    const result = creditsFor([visual], CUSTOM_BOOKS);
    expect(result).toHaveLength(2);
  });

  it('throws for a source whose book is not in allowedBooks', () => {
    const visual = makeVisual([makeSource('s1', 'Unknown Book')]);
    expect(() => creditsFor([visual])).toThrow(/Unknown Book/);
  });

  it('throws even when the unknown book appears alongside a known one', () => {
    const visual = makeVisual([makeSource('s1', BOOK_A), makeSource('s2', 'Unknown Book')]);
    expect(() => creditsFor([visual])).toThrow(/Unknown Book/);
  });

  it('does not mutate the input array', () => {
    const visuals = [makeVisual([makeSource('s1')])];
    const original = [...visuals];
    creditsFor(visuals);
    expect(visuals).toEqual(original);
  });
});

// ── real batch-1 content files ────────────────────────────────────────────────

describe('real batch-1 content files', () => {
  it('three real visual files together produce exactly one credit', async () => {
    const [fc, ofs, skp] = await Promise.all([
      import('../../content/visuals/fluid-compartments.json'),
      import('../../content/visuals/osmosis-fluid-shifts.json'),
      import('../../content/visuals/sodium-potassium-pump.json'),
    ]);
    const batch1 = [fc.default, ofs.default, skp.default] as unknown as Pick<Visual, 'sources'>[];
    const credits = creditsFor(batch1);
    expect(credits).toHaveLength(1);
    expect(credits[0].book).toBe('Open RN Nursing Fundamentals 2e');
  });

  it('each real file on its own produces exactly one credit', async () => {
    const [fc, ofs, skp] = await Promise.all([
      import('../../content/visuals/fluid-compartments.json'),
      import('../../content/visuals/osmosis-fluid-shifts.json'),
      import('../../content/visuals/sodium-potassium-pump.json'),
    ]);
    for (const file of [fc.default, ofs.default, skp.default]) {
      const credits = creditsFor([file as unknown as Pick<Visual, 'sources'>]);
      expect(credits).toHaveLength(1);
    }
  });
});
