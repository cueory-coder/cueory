import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allowedBooks, type Visual } from '../../src/visuals/sources';
import { reviewSheet } from '../../src/visuals/sheet';

const book = allowedBooks[0]!;
const sample: Visual = {
  id: 'sample-visual', title: 'sample: review sheet', kind: 'diagram', status: 'draft',
  lessonIds: ['U00-T01-L01', 'U00-T01-L02'],
  labels: [{ id: 'sample-label', text: 'sample: label', source: 'sample-source' }],
  depictions: [{ id: 'sample-depiction', what: 'sample: a circle', source: 'sample-source' }],
  sources: [{ id: 'sample-source', quote: 'sample: the exact source words.', book: book.book,
    section: 'sample: section', url: `${book.urlPrefix}sample/`, license: book.license, retrieved: '2026-11-01' }],
};

/** Count table separators, independently accounting for escaped backslashes. */
function separators(line: string): number {
  let slashes = 0, count = 0;
  for (const character of line) {
    if (character === '|' && slashes % 2 === 0) count++;
    slashes = character === '\\' ? slashes + 1 : 0;
  }
  return count;
}

describe('the real batch-1 review sheets', () => {
  it.each(['fluid-compartments', 'osmosis-fluid-shifts', 'sodium-potassium-pump'])(
    'copies every label, depiction and citation from %s', id => {
      const visual: Visual = JSON.parse(readFileSync(new URL(`../../content/visuals/${id}.json`, import.meta.url), 'utf8'));
      const before = JSON.stringify(visual);
      const sheet = reviewSheet(visual);
      expect(sheet).toContain(`# ${visual.title}`);
      expect(sheet).toContain(`- id: ${id}`);
      expect(sheet).toContain('- status: draft');
      for (const lesson of visual.lessonIds) expect(sheet).toContain(lesson);
      for (const source of visual.sources) {
        expect(sheet).toContain(source.quote);
        expect(sheet).toContain(source.section);
        expect(sheet).toContain(source.url);
        expect(sheet).toContain(book.credit);
        expect(sheet).toContain(book.licenseUrl);
      }
      for (const label of visual.labels) {
        const source = visual.sources.find(candidate => candidate.id === label.source)!;
        expect(sheet).toContain(`| ${label.text} | ${source.id} | ${source.quote} | ${source.section} | ${source.url} |`);
      }
      for (const depiction of visual.depictions) {
        const source = visual.sources.find(candidate => candidate.id === depiction.source)!;
        expect(sheet).toContain(`| ${depiction.what} | ${source.id} | ${source.quote} | ${source.section} | ${source.url} |`);
      }
      expect(sheet.split('\n').filter(line => line.startsWith('|'))).toHaveLength(visual.labels.length + visual.depictions.length + 4);
      expect(sheet.split('\n').filter(line => line.startsWith('|')).every(line => separators(line) === 6)).toBe(true);
      expect(JSON.stringify(visual)).toBe(before);
      expect(visual.status).toBe('draft');
    },
  );
});

describe('review-sheet formatting', () => {
  it('includes the requested metadata, headings and unticked checklist', () => {
    const sheet = reviewSheet(sample);
    expect(sheet).toContain('- lesson ids: U00-T01-L01, U00-T01-L02');
    expect(sheet).toContain('## words on the drawing');
    expect(sheet).toContain('## drawn without words');
    expect(sheet).toContain('- [ ] every label matches its quote');
    expect(sheet).toContain('- [ ] every depiction matches its quote');
    expect(sheet).toContain('- [ ] approve');
    expect(sheet).not.toContain('- [x]');
    expect(sheet.endsWith('\n')).toBe(true);
  });

  it('escapes a pipe, an existing backslash and every line break without adding table rows', () => {
    const visual = structuredClone(sample);
    visual.labels = [{ ...visual.labels[0]!, text: 'sample | label' }];
    visual.sources = [{ ...visual.sources[0]!, quote: 'sample: a\\|b\r\nnext\n\nlast\rfinal' }];
    const sheet = reviewSheet(visual);
    expect(sheet).toContain('sample \\| label');
    expect(sheet).toContain('sample: a' + '\\'.repeat(3) + '|b<br>next<br><br>last<br>final');
    const tables = sheet.split('\n').filter(line => line.startsWith('|'));
    expect(tables).toHaveLength(6);
    expect(tables.every(line => separators(line) === 6)).toBe(true);
  });

  it('keeps HTML and Markdown syntax as literal source text', () => {
    const visual = structuredClone(sample);
    visual.sources = [{ ...visual.sources[0]!, quote: 'sample: <tag> & [text] *stars* _under_ `code`' }];
    expect(reviewSheet(visual)).toContain('sample: &lt;tag&gt; &amp; \\[text\\] \\*stars\\* \\_under\\_ \\`code\\`');
  });

  it('keeps labels and depictions in source-file order and credits the book once', () => {
    const visual: Visual = { ...sample,
      labels: [{ ...sample.labels[0]!, id: 'sample-z', text: 'sample: z label' }, { ...sample.labels[0]!, id: 'sample-a', text: 'sample: a label' }],
      depictions: [{ ...sample.depictions[0]!, id: 'sample-z', what: 'sample: z drawing' }, { ...sample.depictions[0]!, id: 'sample-a', what: 'sample: a drawing' }],
    };
    const sheet = reviewSheet(visual);
    expect(sheet.indexOf('sample: z label')).toBeLessThan(sheet.indexOf('sample: a label'));
    expect(sheet.indexOf('sample: z drawing')).toBeLessThan(sheet.indexOf('sample: a drawing'));
    expect(sheet.split(book.credit)).toHaveLength(2);
  });

  it('supports a source id that is also an Object prototype name', () => {
    const visual: Visual = { ...sample,
      labels: [{ ...sample.labels[0]!, source: 'constructor' }],
      depictions: [{ ...sample.depictions[0]!, source: 'constructor' }],
      sources: [{ ...sample.sources[0]!, id: 'constructor' }],
    };
    expect(reviewSheet(visual)).toContain('| constructor | sample: the exact source words. |');
  });

  it('does not change the approved status or automatically tick approval', () => {
    const visual: Visual = { ...sample, status: 'approved' };
    expect(reviewSheet(visual)).toContain('- status: approved');
    expect(reviewSheet(visual)).toContain('- [ ] approve');
    expect(visual.status).toBe('approved');
  });
});

describe('invalid source references', () => {
  it.each(['labels', 'depictions'] as const)('throws when a %s entry points at an unknown source', field => {
    const visual: Visual = field === 'labels'
      ? { ...sample, labels: [{ ...sample.labels[0]!, source: 'sample-missing' }] }
      : { ...sample, depictions: [{ ...sample.depictions[0]!, source: 'sample-missing' }] };
    expect(() => reviewSheet(visual)).toThrow("isn't in the file");
  });

  it('throws for an unknown book instead of inventing a credit', () => {
    const visual = structuredClone(sample);
    visual.sources = [{ ...visual.sources[0]!, book: 'sample: unlisted book' }];
    expect(() => reviewSheet(visual)).toThrow("isn't an allowed book");
  });

  it('rejects ambiguous source and label ids using the existing visual validator', () => {
    expect(() => reviewSheet({ ...sample, sources: [...sample.sources, sample.sources[0]!] })).toThrow('two sources');
    expect(() => reviewSheet({ ...sample, labels: [...sample.labels, sample.labels[0]!] })).toThrow('two labels');
  });
});
