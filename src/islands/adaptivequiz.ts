/** Local-only labeled-sample preview. Selection delegates to adaptive.ts and status words to conceptstatus.ts. */
import { nextQuestion, type AdaptiveAttempt, type AdaptiveQuestion } from './adaptive';
import { statusesFrom, type ConceptAttempt } from './conceptstatus';

export type SampleChoice = 'a' | 'b';
export interface AdaptiveSampleQuestion extends AdaptiveQuestion {
  prompt: string;
  choices: { id: SampleChoice; text: string }[];
  sampleKey: SampleChoice;
}
const make = (id: string, concept: string, level: 1 | 2 | 3, number: number,
  sampleKey: SampleChoice): AdaptiveSampleQuestion => ({
  id, concept, level, prompt: '[sample question] ' + number,
  choices: [{ id: 'a', text: '[sample] choice A' }, { id: 'b', text: '[sample] choice B' }],
  sampleKey,
});
/** Five examples: the existing last-five-attempt exclusion prevents repeats and makes the preview finite. */
export const SAMPLE_ADAPTIVE_QUESTIONS: readonly AdaptiveSampleQuestion[] = [
  make('sample-a1', '[sample concept A]', 1, 1, 'a'),
  make('sample-a2', '[sample concept A]', 1, 2, 'b'),
  make('sample-a3', '[sample concept A]', 2, 3, 'a'),
  make('sample-b1', '[sample concept B]', 1, 4, 'b'),
  make('sample-b2', '[sample concept B]', 3, 5, 'a'),
];

export interface AdaptiveQuizSession {
  questions: readonly AdaptiveSampleQuestion[];
  attempts: readonly AdaptiveAttempt[];
  step: 'asking' | 'answered' | 'finished';
  current: { id: string; why: string } | null;
  picked: SampleChoice | null;
  lastRight: boolean | null;
}

function validated(questions: readonly AdaptiveSampleQuestion[]): AdaptiveSampleQuestion[] {
  if (!Array.isArray(questions) || questions.length > 5) throw new Error('up to five labeled samples only.');
  const ids = new Set<string>();
  return questions.map(q => {
    if (!q || typeof q.id !== 'string' || !q.id.trim() || ids.has(q.id) ||
        typeof q.concept !== 'string' || !/^\[sample concept [A-Za-z0-9]+\]$/.test(q.concept) ||
        typeof q.prompt !== 'string' || !/^\[sample question\] [1-9]\d*$/.test(q.prompt) ||
        (q.level !== 1 && q.level !== 2 && q.level !== 3) ||
        !Array.isArray(q.choices) || q.choices.length !== 2 ||
        !q.choices.every((c: { id: SampleChoice; text: string }) => c && (c.id === 'a' || c.id === 'b') &&
          typeof c.text === 'string' && c.text.startsWith('[sample]')) ||
        new Set(q.choices.map((c: { id: SampleChoice; text: string }) => c.id)).size !== 2 ||
        !q.choices.some((c: { id: SampleChoice; text: string }) => c.id === q.sampleKey)) throw new Error('only well-formed labeled samples.');
    ids.add(q.id);
    return { id: q.id, concept: q.concept, level: q.level, prompt: q.prompt, sampleKey: q.sampleKey,
      choices: q.choices.map((c: { id: SampleChoice; text: string }) => ({ id: c.id, text: c.text })) };
  });
}
export function startAdaptiveQuiz(questions: readonly AdaptiveSampleQuestion[] = SAMPLE_ADAPTIVE_QUESTIONS): AdaptiveQuizSession {
  const bank = validated(questions);
  const current = nextQuestion(bank, [], 0);
  return { questions: bank, attempts: [], step: current ? 'asking' : 'finished',
    current: current ?? null, picked: null, lastRight: null };
}
export function currentAdaptiveSample(session: AdaptiveQuizSession): AdaptiveSampleQuestion | undefined {
  return session.step === 'finished' || !session.current ? undefined :
    session.questions.find(q => q.id === session.current?.id);
}
export function chooseAdaptiveSample(session: AdaptiveQuizSession, picked: SampleChoice): AdaptiveQuizSession {
  const current = currentAdaptiveSample(session);
  return session.step === 'asking' && current?.choices.some(choice => choice.id === picked)
    ? { ...session, picked } : session;
}
export function checkAdaptiveSample(session: AdaptiveQuizSession): AdaptiveQuizSession {
  const current = currentAdaptiveSample(session);
  if (session.step !== 'asking' || !current || !session.picked) return session;
  const right = session.picked === current.sampleKey;
  return { ...session, step: 'answered', lastRight: right,
    attempts: [...session.attempts, { questionId: current.id, right }] };
}
export function nextAdaptiveSample(session: AdaptiveQuizSession): AdaptiveQuizSession {
  if (session.step !== 'answered') return session;
  const next = nextQuestion(session.questions, session.attempts, session.attempts.length);
  return { ...session, step: next ? 'asking' : 'finished',
    current: next ?? null, picked: null, lastRight: null };
}
export function adaptiveSampleSummary(session: AdaptiveQuizSession): string {
  return 'right on ' + session.attempts.filter(a => a.right).length +
    ' of ' + session.attempts.length + ' sample questions.';
}
/** Synthetic chronological timestamps carry only in-memory order. None are stored or transmitted. */
export function adaptiveSampleConcepts(session: AdaptiveQuizSession) {
  const definitions = [...new Map(session.questions.map(q =>
    [q.concept, { id: q.concept, concept: q.concept }] as const)).values()];
  const byId = new Map(session.questions.map(q => [q.id, q] as const));
  const history: ConceptAttempt[] = session.attempts.map((attempt, index) => {
    const question = byId.get(attempt.questionId)!;
    return { item_id: question.id, concept_id: question.concept, correct: attempt.right,
      level: question.level, created_at: '2026-11-01T00:00:0' + index + 'Z' };
  });
  return statusesFrom(history, definitions).statuses;
}
