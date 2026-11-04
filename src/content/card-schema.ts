/** Return the positions whose ids repeat an earlier card in the same deck. */
export function repeatedCardIndexes(ids: readonly string[]): number[] {
  const seen = new Set<string>();
  const repeated: number[] = [];
  ids.forEach((id, index) => {
    if (seen.has(id)) repeated.push(index);
    seen.add(id);
  });
  return repeated;
}
