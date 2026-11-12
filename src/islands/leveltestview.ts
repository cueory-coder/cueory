/** In-memory, labeled-sample level-test preview. Nothing is stored or sent. */
import type { AdaptiveAttempt, AdaptiveQuestion } from './adaptive';
import { levelTestInWords, levelTestResult, nextInLevelTest, type LevelTestProgress } from './leveltest';

export interface SampleChoice { id: string; label: string }
export interface SampleLevelQuestion extends AdaptiveQuestion {
  prompt: string;
  choices: readonly SampleChoice[];
  correctChoice: string;
}
const choices: readonly SampleChoice[] = [
  { id: 'a', label: '[sample] choice a' },
  { id: 'b', label: '[sample] choice b' },
];
/** Dummy choices demonstrate branching, not actual educational questions. */
export const SAMPLE_LEVEL_QUESTIONS: readonly SampleLevelQuestion[] = [
  { id: 'sample-one-2', concept: '[sample concept one]', level: 2, prompt: '[sample question] one', choices, correctChoice: 'a' },
  { id: 'sample-one-3', concept: '[sample concept one]', level: 3, prompt: '[sample question] three', choices, correctChoice: 'b' },
  { id: 'sample-two-2', concept: '[sample concept two]', level: 2, prompt: '[sample question] two', choices, correctChoice: 'a' },
  { id: 'sample-two-3', concept: '[sample concept two]', level: 3, prompt: '[sample question] four', choices, correctChoice: 'b' },
];

export interface SampleLevelTestView {
  current: SampleLevelQuestion | null;
  questionNumber: number;
  complete: boolean;
  introduction: string;
  results: LevelTestProgress[];
  resultWords: string | null;
}

/** Descriptive statuses only, never grades, passing probabilities or exam predictions. */
export function sampleResultWords(results: readonly LevelTestProgress[]): string {
  const learning = results.filter(item => item.status === 'learning').length;
  const gettingThere = results.filter(item => item.status === 'getting there').length;
  const gotIt = results.filter(item => item.status === 'got it').length;
  return results.length + ' sample ' + (results.length === 1 ? 'concept' : 'concepts') + ' checked. ' +
    learning + ' still learning, ' + gettingThere + ' getting there, ' + gotIt + ' got it.';
}

/** Every screen is derived from the established level-test engine and local attempts. */
export function sampleLevelTestView(attempts: readonly AdaptiveAttempt[]): SampleLevelTestView {
  const id = nextInLevelTest(SAMPLE_LEVEL_QUESTIONS, attempts, 0);
  const current = SAMPLE_LEVEL_QUESTIONS.find(item => item.id === id) ?? null;
  const complete = current === null;
  const results = complete ? levelTestResult(SAMPLE_LEVEL_QUESTIONS, attempts) : [];
  return {
    current, complete,
    questionNumber: attempts.length + 1,
    introduction: levelTestInWords(SAMPLE_LEVEL_QUESTIONS),
    results,
    resultWords: complete ? sampleResultWords(results) : null,
  };
}

/** Reject unknown choices, old question ids and attempts after the session finishes. */
export function chooseSampleAnswer(
  attempts: readonly AdaptiveAttempt[], questionId: string, choiceId: string,
): AdaptiveAttempt[] {
  const current = sampleLevelTestView(attempts).current;
  if (!current || current.id !== questionId || !current.choices.some(choice => choice.id === choiceId)) {
    return [...attempts];
  }
  return [...attempts, { questionId, right: current.correctChoice === choiceId }];
}
