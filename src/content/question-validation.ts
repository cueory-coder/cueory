export type QuestionChoice = { id: 'a' | 'b' | 'c' | 'd' | 'e' };
export type QuestionContentItem = {
  id: string;
  choices: QuestionChoice[];
  rationales: Partial<Record<QuestionChoice['id'], string>>;
};

/** Return content-build problems for sample questions that would leave a choice unexplained. */
export function questionContentProblems(items: QuestionContentItem[]): string[] {
  const problems: string[] = [];
  for (const item of items) {
    for (const choice of item.choices) {
      if (!item.rationales[choice.id]?.trim()) {
        problems.push(`question "${item.id}" is missing a rationale for choice ${choice.id}`);
      }
    }
  }
  return problems;
}
