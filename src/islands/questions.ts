/** Questions player (D-33, D-45): public questions have no key; a supplied checker returns results after an attempt. */
export type ChoiceId = 'a' | 'b' | 'c' | 'd' | 'e';
export interface Question {
  id: string;
  type: 'single' | 'sata';
  stem: string;
  choices: { id: ChoiceId; text: string }[];
}
export interface CheckResult {
  correct: boolean;
  key: ChoiceId[];
  rationales: Partial<Record<ChoiceId, string>>;
}
export type Checker = (questionId: string, picked: ChoiceId[]) => Promise<CheckResult>;
export interface CheckedAnswer extends CheckResult { picked: ChoiceId[] }
export interface QuestionState {
  questions: Question[];
  index: number;
  picked: ChoiceId[];
  results: Record<string, CheckedAnswer>;
  finished: boolean;
}
export type ChoiceMark = 'right-pick' | 'wrong-pick' | 'missed' | 'plain';
export const MARKS: Record<ChoiceMark, { symbol: string; words: string }> = {
  'right-pick': { symbol: '✓', words: "you picked this, and it's right" },
  'wrong-pick': { symbol: '✗', words: "you picked this, but it's not right" },
  missed: { symbol: '○', words: "this is right, and you didn't pick it" },
  plain: { symbol: '', words: '' },
};
const IDS: ChoiceId[] = ['a', 'b', 'c', 'd', 'e'];
const isId = (id: unknown): id is ChoiceId => IDS.includes(id as ChoiceId);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Validate and copy only the public fields. Refuse accidentally supplied keys or rationales. */
function publicQuestion(value: unknown): Question {
  if (!record(value) || Object.keys(value).some((key) => !['id', 'type', 'stem', 'choices'].includes(key)) ||
      !text(value.id) || !text(value.stem) || (value.type !== 'single' && value.type !== 'sata') ||
      !Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 5) {
    throw new Error('a question needs only an id, type, stem and two to five public choices.');
  }
  const seen = new Set<ChoiceId>();
  const choices = Array.from(value.choices).map((choice) => {
    if (!record(choice) || Object.keys(choice).some((key) => !['id', 'text'].includes(key)) ||
        !isId(choice.id) || !text(choice.text) || seen.has(choice.id)) {
      throw new Error('each choice needs a unique letter from a to e and its text, without answer data.');
    }
    seen.add(choice.id);
    return { id: choice.id, text: choice.text };
  });
  return { id: value.id, type: value.type as Question['type'], stem: value.stem, choices };
}

export function startQuestions(questions: Question[]): QuestionState {
  const clean = Array.from(questions).map(publicQuestion);
  if (new Set(clean.map((question) => question.id)).size !== clean.length) throw new Error('each question needs a unique id.');
  return { questions: clean, index: 0, picked: [], results: {}, finished: clean.length === 0 };
}
export const currentQuestion = (state: QuestionState): Question | undefined => state.finished ? undefined : state.questions[state.index];
export function currentResult(state: QuestionState): CheckedAnswer | undefined {
  const question = currentQuestion(state);
  return question && Object.hasOwn(state.results, question.id) ? state.results[question.id] : undefined;
}
export function pick(state: QuestionState, choiceId: ChoiceId): QuestionState {
  const question = currentQuestion(state);
  if (!question || currentResult(state) || !question.choices.some((choice) => choice.id === choiceId)) return state;
  const picked = question.type === 'single' ? [choiceId] : state.picked.includes(choiceId)
    ? state.picked.filter((id) => id !== choiceId) : [...state.picked, choiceId];
  return { ...state, picked };
}
export const canCheck = (state: QuestionState): boolean => !!currentQuestion(state) && !currentResult(state) && state.picked.length > 0;

/** D-45: order does not matter; an extra, missing, duplicate or invalid choice is never right. */
export function allOrNothing(picked: ChoiceId[], key: ChoiceId[]): boolean {
  return key.length > 0 && Array.from(key).every(isId) && Array.from(picked).every(isId) &&
    new Set(key).size === key.length && new Set(picked).size === picked.length &&
    picked.length === key.length && picked.every((id) => key.includes(id));
}
export function choiceMarks(picked: ChoiceId[], key: ChoiceId[]): Record<ChoiceId, ChoiceMark> {
  return Object.fromEntries(IDS.map((id) => [id, picked.includes(id)
    ? key.includes(id) ? 'right-pick' : 'wrong-pick' : key.includes(id) ? 'missed' : 'plain'])) as Record<ChoiceId, ChoiceMark>;
}

/** A malformed checker response is a failed check, never a result or a score. */
export function validateResult(question: Question, picked: ChoiceId[], value: unknown): CheckResult {
  if (!record(value) || typeof value.correct !== 'boolean' || !Array.isArray(value.key) ||
      value.key.length === 0 || !Array.from(value.key).every(isId) || new Set(value.key).size !== value.key.length ||
      value.key.some((id) => !question.choices.some((choice) => choice.id === id)) ||
      (question.type === 'single' && value.key.length !== 1) || !record(value.rationales) ||
      value.correct !== allOrNothing(picked, value.key)) throw new Error('the checker returned an invalid result.');
  const rationales: Partial<Record<ChoiceId, string>> = {};
  for (const [id, rationale] of Object.entries(value.rationales)) {
    if (!isId(id) || !question.choices.some((choice) => choice.id === id) || !text(rationale)) {
      throw new Error('the checker returned an invalid rationale.');
    }
    rationales[id] = rationale;
  }
  return { correct: value.correct, key: [...value.key], rationales };
}
export function recordResult(state: QuestionState, value: CheckResult): QuestionState {
  const question = currentQuestion(state);
  if (!question || !canCheck(state)) return state;
  const result = validateResult(question, state.picked, value);
  return { ...state, results: { ...state.results, [question.id]: { ...result, picked: [...state.picked] } } };
}
export function next(state: QuestionState): QuestionState {
  if (!currentResult(state)) return state;
  return state.index + 1 === state.questions.length ? { ...state, finished: true }
    : { ...state, index: state.index + 1, picked: [] };
}
export function summary(state: QuestionState): string {
  return `right on ${Object.values(state.results).filter((result) => result.correct).length} of ${state.questions.length}.`;
}
export function retryMissed(state: QuestionState): QuestionState {
  if (!state.finished) return state;
  return startQuestions(state.questions.filter((question) => Object.hasOwn(state.results, question.id) && !state.results[question.id]!.correct));
}
export interface SampleItem extends Question {
  status: string;
  key: ChoiceId[];
  rationales: Partial<Record<ChoiceId, string>>;
}
/** Test/demo adapter only. No question-bank loader or real answer data is imported by this module. */
export function sampleChecker(items: SampleItem[]): Checker {
  const samples = new Map<string, { question: Question; key: ChoiceId[]; rationales: CheckResult['rationales'] }>();
  for (const item of items) {
    if (item.status !== 'sample') throw new Error('the sample checker accepts sample items only.');
    if (samples.has(item.id)) throw new Error('each sample needs a unique id.');
    const question = publicQuestion({ id: item.id, type: item.type, stem: item.stem, choices: item.choices });
    const result = validateResult(question, item.key, { correct: true, key: item.key, rationales: item.rationales });
    samples.set(item.id, { question, key: result.key, rationales: result.rationales });
  }
  return async (id, picked) => {
    const item = samples.get(id);
    if (!item) throw new Error('no sample with that id.');
    if (picked.length === 0 || new Set(picked).size !== picked.length ||
        picked.some((choice) => !item.question.choices.some((option) => option.id === choice)) ||
        (item.question.type === 'single' && picked.length !== 1)) throw new Error('pick valid choices before checking.');
    return { correct: allOrNothing(picked, item.key), key: [...item.key], rationales: { ...item.rationales } };
  };
}
