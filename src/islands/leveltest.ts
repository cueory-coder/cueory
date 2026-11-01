/**
 * Unit level-test rules (ROADMAP Task 4b):
 * - Ask every concept once in first-seen order, then ask each eligible concept once more.
 * - Start at level 2, or the nearest available level, preferring the easier level on a tie.
 * - A wrong first answer ends that concept. A right first answer allows one unused level 3 question.
 * - Never repeat a question. Ties use the same finite, truncated, wrapped seed index as adaptive.ts.
 * - "got it" needs two right answers, with the second at level 3, even after a first-level fallback.
 * - A right first answer with no unused level 3 question is "getting there".
 * - Preserve reviewed ids and names; generated descriptions and summaries use only plain status words and counts.
 */
import type { AdaptiveAttempt, AdaptiveQuestion, ConceptProgressStatus } from './adaptive';

interface Answered { question: AdaptiveQuestion; right: boolean }
interface ConceptTest {
  concept: string;
  questions: AdaptiveQuestion[];
  firstLevel: AdaptiveQuestion['level'];
  first?: Answered;
  second?: Answered;
}
export interface LevelTestProgress {
  concept: string;
  status: ConceptProgressStatus;
  description: string;
}

function conceptsIn(questions: readonly AdaptiveQuestion[]): ConceptTest[] {
  if (!Array.isArray(questions) || questions.length === 0) throw new Error('the level test needs at least one question.');
  const ids = new Set<string>();
  const concepts = new Map<string, ConceptTest>();
  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !question.id.trim()) throw new Error('each question needs an id.');
    if (typeof question.concept !== 'string' || !question.concept.trim()) throw new Error('each question needs a concept.');
    if ([...question.id].length > 200) throw new Error('a question id can have at most 200 characters.');
    if ([...question.concept].length > 200) throw new Error('a concept name can have at most 200 characters.');
    if (![1, 2, 3].includes(question.level)) throw new Error('each question needs a level from 1 to 3.');
    if (ids.has(question.id)) throw new Error('a question id is repeated.');
    ids.add(question.id);
    let concept = concepts.get(question.concept);
    if (!concept) {
      concept = { concept: question.concept, questions: [], firstLevel: 2 };
      concepts.set(question.concept, concept);
    }
    concept.questions.push(question);
  }
  for (const concept of concepts.values()) {
    concept.firstLevel = ([2, 1, 3] as const).find(level => concept.questions.some(question => question.level === level))!;
  }
  return [...concepts.values()];
}

function progress(questions: readonly AdaptiveQuestion[], attempts: readonly AdaptiveAttempt[]) {
  const concepts = conceptsIn(questions);
  const byId = new Map(questions.map(question => [question.id, question]));
  const byConcept = new Map(concepts.map(concept => [concept.concept, concept]));
  const used = new Set<string>();
  // Unknown ids, duplicate attempts and answers outside the current path cannot add progress.
  for (const attempt of attempts) {
    const question = byId.get(attempt.questionId);
    if (!question || used.has(question.id) || typeof attempt.right !== 'boolean') continue;
    used.add(question.id);
    const concept = byConcept.get(question.concept)!;
    if (!concept.first && question.level === concept.firstLevel) concept.first = { question, right: attempt.right };
    else if (concept.first?.right && !concept.second && question.level === 3) concept.second = { question, right: attempt.right };
  }
  return { concepts, used };
}

function pick(questions: readonly AdaptiveQuestion[], seed: number): string | undefined {
  if (questions.length === 0) return;
  const whole = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return questions[((whole % questions.length) + questions.length) % questions.length]!.id;
}

export function nextInLevelTest(
  questions: readonly AdaptiveQuestion[], attempts: readonly AdaptiveAttempt[], seed: number,
): string | undefined {
  const { concepts, used } = progress(questions, attempts);
  for (const concept of concepts) {
    if (!concept.first) return pick(concept.questions.filter(question => question.level === concept.firstLevel && !used.has(question.id)), seed);
  }
  for (const concept of concepts) {
    if (concept.first?.right && !concept.second) {
      const next = pick(concept.questions.filter(question => question.level === 3 && !used.has(question.id)), seed);
      if (next !== undefined) return next;
    }
  }
  return undefined;
}

export function levelTestResult(
  questions: readonly AdaptiveQuestion[], attempts: readonly AdaptiveAttempt[],
): LevelTestProgress[] {
  return progress(questions, attempts).concepts.map(({ concept, first, second }) => {
    if (!first) return { concept, status: 'not started', description: 'this concept has not been started.' };
    if (!first.right) return { concept, status: 'learning', description: 'this concept is still learning.' };
    if (second?.right) return { concept, status: 'got it', description: 'this concept is going well.' };
    return { concept, status: 'getting there', description: 'this concept is getting there.' };
  });
}

export function levelTestInWords(questions: readonly AdaptiveQuestion[]): string {
  const concepts = conceptsIn(questions);
  const capacity = concepts.map(concept => {
    const thirds = concept.questions.filter(question => question.level === 3).length;
    return thirds > (concept.firstLevel === 3 ? 1 : 0) ? 2 : 1;
  });
  const total = capacity.reduce((sum, count) => sum + count, 0);
  const beginning = `the level test has up to ${total} ${total === 1 ? 'question' : 'questions'}`;
  const count = `${concepts.length} ${concepts.length === 1 ? 'concept' : 'concepts'}`;
  if (concepts.length === 1) return `${beginning} for 1 concept.`;
  if (capacity.every(value => value === capacity[0])) {
    return `${beginning}: ${capacity[0] === 1 ? '1 question' : 'up to 2'} for each of ${count}.`;
  }
  const twos = capacity.filter(value => value === 2).length, ones = concepts.length - twos;
  const forConcepts = (number: number) => number === 1 ? 'for 1 concept' : `for each of ${number} concepts`;
  return `${beginning} across ${count}: up to 2 ${forConcepts(twos)} and 1 question ${forConcepts(ones)}.`;
}
