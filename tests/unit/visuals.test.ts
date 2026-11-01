import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allowedBooks,
  approvedOnly,
  creditsFor,
  labelText,
  notesFor,
  OVERLAY_NOTE,
  unknownLessons,
  visualProblems,
  type Visual,
} from '../../src/visuals/sources';

/**
 * The visuals kit's source-file check (Task 6, D-56, docs/VISUALS.md). The sample below is test data in the shape of a
 * real source file: its words are placeholders, not facts about the body.
 */
/** Just the messages, in order. */
const messages = (visual: Visual) => visualProblems(visual).map((problem) => problem.message);

const sample = (): Visual => ({
  id: 'sample-visual',
  title: 'sample visual',
  kind: 'diagram',
  lessonIds: ['U01-T01-L01'],
  status: 'draft',
  labels: [{ id: 'label-a', text: 'label a', source: 'source-a' }],
  depictions: [{ id: 'shape-a', what: 'a shape', source: 'source-a' }],
  sources: [
    {
      id: 'source-a',
      quote: 'placeholder words for a test',
      book: 'Open RN Nursing Fundamentals 2e',
      section: 'a section',
      url: 'https://wtcs.pressbooks.pub/nursingfundamentals/chapter/a-page/',
      license: 'CC BY 4.0',
      retrieved: '2026-11-01',
    },
  ],
});

describe('a visual source file (docs/VISUALS.md)', () => {
  it('passes when every label and depiction points to a source from an allowed book', () => {
    expect(visualProblems(sample())).toEqual([]);
  });

  it('needs every label and depiction to point to a source in the file', () => {
    const visual = sample();
    visual.labels = [{ id: 'label-a', text: 'label a', source: 'missing' }];
    visual.depictions = [{ id: 'shape-a', what: 'a shape', source: 'also-missing' }];
    // Each problem names the part of the file it is in, so the build's message points there.
    expect(visualProblems(visual)).toEqual([
      { field: 'labels', message: `label "label-a" points to source "missing", which isn't in the file` },
      { field: 'depictions', message: `depiction "shape-a" points to source "also-missing", which isn't in the file` },
      { field: 'sources', message: `source "source-a" isn't used by any label or depiction` },
    ]);
  });

  it('needs at least one label or depiction', () => {
    const visual = { ...sample(), labels: [], depictions: [], sources: [] };
    expect(messages(visual)).toEqual(['a visual needs at least one label or depiction']);
  });

  it('refuses two labels, depictions or sources with the same id', () => {
    const visual = sample();
    visual.labels = [...visual.labels, { id: 'label-a', text: 'another', source: 'source-a' }];
    visual.depictions = [...visual.depictions, { id: 'shape-a', what: 'another', source: 'source-a' }];
    visual.sources = [...visual.sources, { ...visual.sources[0]! }];
    expect(messages(visual)).toEqual([
      'two labels have the id "label-a"',
      'two depictions have the id "shape-a"',
      'two sources have the id "source-a"',
    ]);
  });

  it('refuses a book that is not allowed, such as OpenStax while it is on hold (D-57)', () => {
    const visual = sample();
    visual.sources = [
      {
        ...visual.sources[0]!,
        book: 'OpenStax Anatomy and Physiology 2e',
        url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/1-introduction',
        license: 'CC BY-NC-SA 4.0',
      },
    ];
    expect(messages(visual)).toEqual([
      `source "source-a" quotes "OpenStax Anatomy and Physiology 2e", which isn't an allowed book (src/visuals/sources.ts)`,
    ]);
  });

  it("needs the address of the page it quotes, inside the book's site", () => {
    for (const url of [
      'https://wtcs.pressbooks.pub/nursingfundamentals/',
      'https://wtcs.pressbooks.pub/nursingskills/chapter/a-page/',
      'https://example.com/nursingfundamentals/chapter/a-page/',
    ]) {
      const visual = sample();
      visual.sources = [{ ...visual.sources[0]!, url }];
      expect(messages(visual), url).toEqual([
        'source "source-a" must link to the page it quotes, under https://wtcs.pressbooks.pub/nursingfundamentals/',
      ]);
    }
  });

  it("needs the license to match the book's", () => {
    const visual = sample();
    visual.sources = [{ ...visual.sources[0]!, license: 'CC BY-NC 4.0' }];
    expect(messages(visual)).toEqual([
      'source "source-a" says "CC BY-NC 4.0", but Open RN Nursing Fundamentals 2e is CC BY 4.0',
    ]);
  });

  it('names the lesson ids that are not in the lesson map', () => {
    const visual = { ...sample(), lessonIds: ['U01-T01-L01', 'U99-T99-L99'] };
    expect(unknownLessons(visual, lessonMap)).toEqual(['U99-T99-L99']);
  });
});

describe('using a visual on a page', () => {
  it('gives the text of a label the drawing uses, and stops the build for one that is not in the file', () => {
    expect(labelText(sample(), 'label-a')).toBe('label a');
    expect(() => labelText(sample(), 'label-b')).toThrow(
      'The drawing of "sample-visual" uses the label "label-b", which isn\'t in content/visuals/sample-visual.json.',
    );
  });

  it('shows only approved visuals: a draft never reaches the live site', () => {
    const draft = sample();
    const ready = { ...sample(), id: 'ready', status: 'approved' as const };
    expect(approvedOnly([draft, ready]).map((visual) => visual.id)).toEqual(['ready']);
  });

  it('credits each book it quotes, as its license asks', () => {
    const [credit, ...rest] = creditsFor(sample());
    expect(rest).toEqual([]);
    expect(credit?.credit).toBe(
      'Words adapted from Nursing Fundamentals, 2nd Edition, edited by Kim Ernstmeyer and Elizabeth Christman (WisTech Open), CC BY 4.0.',
    );
    expect(credit?.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('says "simplified for learning" on every disease overlay, and only there', () => {
    expect(OVERLAY_NOTE).toBe('simplified for learning');
    expect(notesFor({ kind: 'overlay' })).toEqual(['simplified for learning']);
    expect(notesFor({ kind: 'diagram' })).toEqual([]);
    expect(notesFor({ kind: 'model' })).toEqual([]);
  });
});

describe('the allowed books', () => {
  it('include nothing NonCommercial and no OpenStax (D-57)', () => {
    expect(allowedBooks.length).toBeGreaterThan(0);
    for (const book of allowedBooks) {
      expect(book.license, book.book).not.toMatch(/NC/);
      expect(`${book.book} ${book.urlPrefix}`, book.book).not.toMatch(/openstax/i);
      expect(book.urlPrefix, book.book).toMatch(/^https:\/\/[^/]+\/.+\/$/);
      expect(book.credit, book.book).toContain(book.license);
    }
  });
});

/** The lesson ids in the lesson map, the first column of docs/curriculum/medsurg-lesson-map.csv. */
const lessonMap = new Set(
  readFileSync(new URL('../../docs/curriculum/medsurg-lesson-map.csv', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => /^"(U\d{2}-T\d{2}-L\d{2})"/.exec(line)?.[1])
    .filter((lessonId): lessonId is string => lessonId !== undefined),
);

const visualsDir = new URL('../../content/visuals/', import.meta.url);
/** Every .json file under content/visuals, subfolders included, as paths relative to it. */
const allVisualFiles = existsSync(visualsDir)
  ? readdirSync(visualsDir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.json'))
  : [];
const visualFiles = allVisualFiles.filter((file) => !/[\\/]/.test(file));

describe('the visual source files in content/visuals', () => {
  it('reads the lesson map', () => {
    expect(lessonMap.size).toBeGreaterThan(300);
    expect(lessonMap.has('U01-T01-L01')).toBe(true);
  });

  it('keeps every file directly in content/visuals, where the build reads them (no subfolders)', () => {
    expect(allVisualFiles).toEqual(visualFiles);
  });

  for (const file of visualFiles) {
    it(`${file} passes the checks, names lessons that exist and matches its file name`, () => {
      const visual = JSON.parse(readFileSync(new URL(file, visualsDir), 'utf8')) as Visual;
      expect(visual.id).toBe(file.replace(/\.json$/, ''));
      expect(visualProblems(visual)).toEqual([]);
      expect(unknownLessons(visual, lessonMap)).toEqual([]);
    });
  }
});
