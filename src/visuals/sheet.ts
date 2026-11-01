/** A source-backed review document. This never changes a visual or approves its content. */
import { allowedBooks, labelText, visualProblems, type Visual } from './sources';

/** Preserve literal text in Markdown, including existing backslashes before pipes. */
function literal(text: string): string {
  return text.replaceAll('\\', '\\\\')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[`*_\[\]]/g, character => `\\${character}`)
    .replaceAll('|', '\\|').replace(/\r\n|\r|\n/g, '<br>');
}

function row(cells: readonly string[]): string {
  return `| ${cells.map(literal).join(' | ')} |`;
}

/** Copy source-file wording and citations into a review sheet; never paraphrase. */
export function reviewSheet(visual: Visual): string {
  const problems = visualProblems(visual);
  if (problems.length) throw new Error(problems.map(problem => problem.message).join('; '));
  const sources = new Map(visual.sources.map(source => [source.id, source]));
  const credits: string[] = [];
  const seenBooks = new Set<string>();
  for (const source of visual.sources) {
    const book = allowedBooks.find(candidate => candidate.book === source.book);
    if (!book) throw new Error(`Unknown book: ${source.book}`);
    if (!seenBooks.has(book.book)) {
      seenBooks.add(book.book);
      credits.push(`${literal(book.credit)}\n\n${book.licenseUrl}`);
    }
  }
  const evidence = (sourceId: string): string[] => {
    const source = sources.get(sourceId);
    if (!source) throw new Error(`Unknown source id: ${sourceId}`);
    return [source.id, source.quote, source.section, source.url];
  };
  return [
    `# ${literal(visual.title)}`,
    '',
    `- id: ${literal(visual.id)}`,
    `- status: ${literal(visual.status)}`,
    `- lesson ids: ${visual.lessonIds.map(literal).join(', ')}`,
    '',
    ...credits.flatMap(credit => [credit, '']),
    '## words on the drawing',
    '',
    row(['label text', 'source id', "the book's exact words", 'section', 'page link']),
    '| --- | --- | --- | --- | --- |',
    ...visual.labels.map(label => row([labelText(visual, label.id), ...evidence(label.source)])),
    '',
    '## drawn without words',
    '',
    row(['what', 'source id', "the book's exact words", 'section', 'page link']),
    '| --- | --- | --- | --- | --- |',
    ...visual.depictions.map(depiction => row([depiction.what, ...evidence(depiction.source)])),
    '',
    '## review',
    '',
    '- [ ] every label matches its quote',
    '- [ ] every depiction matches its quote',
    '- [ ] approve',
    '',
  ].join('\n');
}
