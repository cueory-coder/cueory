/** Pure, explainable rules for choosing an adaptive quiz question (ROADMAP Task 4b). */

export interface AdaptiveQuestion {
  id: string;
  concept: string;
  level: 1 | 2 | 3;
}

export interface AdaptiveAttempt {
  questionId: string;
  right: boolean;
}

export type ConceptProgressStatus = 'not started' | 'learning' | 'getting there' | 'got it';

export interface ConceptProgress {
  concept: string;
  status: ConceptProgressStatus;
  description: string;
}

interface ConceptSummary {
  concept: string;
  questions: AdaptiveQuestion[];
  attempts: { attempt: AdaptiveAttempt; question: AdaptiveQuestion }[];
  level: 1 | 2 | 3;
}

/** Keep the first occurrence of each question id so malformed duplicates cannot make selection ambiguous. */
function uniqueQuestions(questions: readonly AdaptiveQuestion[]): AdaptiveQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  });
}

/** The level earned from this concept's known attempts, read oldest first. */
function earnedLevel(
  attempts: readonly { attempt: AdaptiveAttempt; question: AdaptiveQuestion }[],
): 1 | 2 | 3 {
  let level: 1 | 2 | 3 = 1;
  let rightInARow = 0;

  for (const { attempt, question } of attempts) {
    if (!attempt.right) {
      level = Math.max(1, level - 1) as 1 | 2 | 3;
      rightInARow = 0;
      continue;
    }

    // A fallback question at another level does not pretend to prove the current level.
    if (question.level !== level) {
      rightInARow = 0;
      continue;
    }

    rightInARow += 1;
    if (rightInARow >= 2) {
      if (level < 3) level = (level + 1) as 1 | 2 | 3;
      rightInARow = 0;
    }
  }

  return level;
}

function summaries(
  questions: readonly AdaptiveQuestion[],
  attempts: readonly AdaptiveAttempt[],
): ConceptSummary[] {
  const knownQuestions = uniqueQuestions(questions);
  const questionById = new Map(knownQuestions.map((question) => [question.id, question]));
  const concepts: ConceptSummary[] = [];
  const byConcept = new Map<string, ConceptSummary>();

  for (const question of knownQuestions) {
    let summary = byConcept.get(question.concept);
    if (!summary) {
      summary = { concept: question.concept, questions: [], attempts: [], level: 1 };
      byConcept.set(question.concept, summary);
      concepts.push(summary);
    }
    summary.questions.push(question);
  }

  for (const attempt of attempts) {
    const question = questionById.get(attempt.questionId);
    if (question) byConcept.get(question.concept)?.attempts.push({ attempt, question });
  }

  for (const summary of concepts) summary.level = earnedLevel(summary.attempts);
  return concepts;
}

function seededIndex(seed: number, length: number): number {
  if (length <= 1) return 0;
  const wholeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return ((wholeSeed % length) + length) % length;
}

function displayConcept(concept: string): string {
  return concept.trim().toLocaleLowerCase('en-US');
}

/**
 * Pick the next question using only the student's recorded attempts and the written rules.
 * Unknown attempted question ids are ignored for progress, but still occupy their place in the last-five window.
 */
export function nextQuestion(
  questions: readonly AdaptiveQuestion[],
  attempts: readonly AdaptiveAttempt[],
  seed: number,
): { id: string; why: string } | undefined {
  const concepts = summaries(questions, attempts);
  if (concepts.length === 0) return undefined;

  const missedLast = concepts.filter((summary) => summary.attempts.at(-1)?.attempt.right === false);
  const selected =
    missedLast[0] ??
    concepts.reduce((fewest, summary) =>
      summary.attempts.length < fewest.attempts.length ? summary : fewest,
    );

  const recentIds = new Set(attempts.slice(-5).map((attempt) => attempt.questionId));
  const levelOrder: (1 | 2 | 3)[] = [1, 2, 3];
  levelOrder.sort(
    (a, b) => Math.abs(a - selected.level) - Math.abs(b - selected.level) || a - b,
  );

  let candidates: AdaptiveQuestion[] = [];
  for (const level of levelOrder) {
    candidates = selected.questions.filter((question) => question.level === level && !recentIds.has(question.id));
    if (candidates.length > 0) break;
  }
  if (candidates.length === 0) return undefined;

  const question = candidates[seededIndex(seed, candidates.length)]!;
  const concept = displayConcept(selected.concept);
  const latest = selected.attempts.at(-1)?.attempt;
  let why: string;
  if (!latest) why = `'${concept}' is new to you.`;
  else if (!latest.right) why = `more on '${concept}', which you missed last time, at level ${question.level}.`;
  else why = `more on '${concept}', which has the fewest tries, at level ${question.level}.`;

  return { id: question.id, why };
}

/** Word-and-status progress for every concept, in the concepts' first-seen order. */
export function conceptStatus(
  questions: readonly AdaptiveQuestion[],
  attempts: readonly AdaptiveAttempt[],
): ConceptProgress[] {
  return summaries(questions, attempts).map((summary) => {
    const concept = displayConcept(summary.concept);
    let status: ConceptProgressStatus;
    let description: string;

    if (summary.attempts.length === 0) {
      status = 'not started';
      description = `'${concept}' has not been started.`;
    } else if (summary.level === 1) {
      status = 'learning';
      description = `'${concept}' is still learning.`;
    } else if (summary.level === 2) {
      status = 'getting there';
      description = `'${concept}' is getting there.`;
    } else {
      status = 'got it';
      description = `'${concept}' is going well.`;
    }

    return { concept: summary.concept, status, description };
  });
}
