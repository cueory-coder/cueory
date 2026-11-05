export interface LessonSentence { id: string; text: string }

/** Return build-time problems that would make sentence navigation ambiguous or blank. */
export function lessonSentenceProblems(sentences: LessonSentence[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [index, sentence] of sentences.entries()) {
    if (seen.has(sentence.id)) problems.push(`sentence ${index + 1} repeats id "${sentence.id}"`);
    seen.add(sentence.id);
    if (!sentence.text.trim()) problems.push(`sentence ${index + 1} has no meaningful text`);
  }
  return problems;
}
