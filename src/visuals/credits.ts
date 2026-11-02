/**
 * Credits for a lesson page that shows several visuals (Task 42, D-56, D-81).
 * Returns one credit entry per book, in the order the visuals first quote it.
 * A source whose book is not in allowedBooks throws — the build must not silently
 * omit a credit.
 */
import { allowedBooks, type AllowedBook, type Visual } from './sources.ts';

/**
 * Returns each quoted book's credit entry once, in the order the visuals first
 * quote it, for a page that shows `visuals`. Throws if any source names a book
 * that is not in `allowedBooks`.
 */
export function creditsFor(
  visuals: readonly Pick<Visual, 'sources'>[],
  books: readonly AllowedBook[] = allowedBooks,
): AllowedBook[] {
  const booksByName = new Map(books.map((b) => [b.book, b]));
  const seen = new Set<string>();
  const result: AllowedBook[] = [];

  for (const visual of visuals) {
    for (const source of visual.sources) {
      if (!booksByName.has(source.book)) {
        throw new Error(
          `source "${source.id}" quotes "${source.book}", which is not in allowedBooks (src/visuals/sources.ts)`,
        );
      }
      if (!seen.has(source.book)) {
        seen.add(source.book);
        result.push(booksByName.get(source.book)!);
      }
    }
  }

  return result;
}
