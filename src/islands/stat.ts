/**
 * stat (Task 640): fifteen hard clinical questions in a row, one best answer each (a to d), 20 seconds per question.
 * Pure logic, kept apart from the island (StatGame.tsx) so it can be unit tested (tests/unit/stat.test.ts).
 *
 * Its own rules: no pause, no resume, no extra time. The student can change their pick until they press next. Next, or
 * the clock running out, moves straight on to the next question with a fresh 20 seconds. Nothing is graded and no
 * answer or score is shown until all fifteen are done.
 *
 * Content (CLAUDE.md rule 5 and 7): this repository holds only labeled samples ("[sample question 1]"). Grading always
 * goes through an injected grader, so the questions the island renders never carry a key:
 * - sample mode: `sampleGrader`, built from the labeled sample key in content/games/stat (samples only);
 * - real mode: `remoteStatGrader`, which asks the permission-checked `check_answer` RPC through the same client code
 *   the questions player uses (questionsremote.ts). It is not wired to a page yet: see the D-pending note in
 *   docs/status/in-review/task-640-stat.md.
 *
 * Time is read from a deadline, not counted by a timer, so a tab that was in the background still loses its time: on
 * return every question whose clock ran out moves on with no answer, and the student can never get extra seconds.
 */
import { statGame } from '../config/games';
import { dayLabel } from './daily';
import { localDay } from './gameresults';
import { remoteChecker, type RemoteQuestions } from './questionsremote';

/** Questions in a round. */
export const STAT_QUESTIONS = 15;
/** Seconds for each question. */
export const STAT_SECONDS = 20;
/** Seconds left at which the timer is read out to screen readers, once each per question. */
export const ANNOUNCE_AT: readonly number[] = [10, 5];
/** At or under this many seconds the ring shows its "low" look (underlined number, never color alone). */
export const LOW_SECONDS = 5;

/**
 * D-pending (task-640 status note): when the clock runs out on a question that already has a pick, the pick counts,
 * as in the design mockup (gp/stat.js). Set this to false if Christian wants only picks confirmed with next to count.
 */
export const TIMEOUT_KEEPS_PICK = true;

export const STAT_LETTERS = ['a', 'b', 'c', 'd'] as const;
export type StatLetter = (typeof STAT_LETTERS)[number];

/** The capital letter shown for a choice. */
export const letterLabel = (letter: StatLetter): string => letter.toUpperCase();

export function isStatLetter(value: unknown): value is StatLetter {
  return typeof value === 'string' && (STAT_LETTERS as readonly string[]).includes(value);
}

/** A question as the browser renders it. It never carries a key or a rationale. */
export interface StatQuestion {
  /** The item id: the sample's own id, or the published item's uuid in real mode. */
  id: string;
  stem: string;
  choices: Array<{ id: StatLetter; text: string }>;
}

export interface StatAnswer {
  questionId: string;
  /** The answer that counted, or null when none did (time ran out with nothing picked). */
  picked: StatLetter | null;
  /** Whole seconds used, 0 to 20. A question whose clock ran out used all 20. */
  seconds: number;
  timedOut: boolean;
}

export interface StatState {
  /** The question being shown (0 to 14). Stays at the last one once the round is over. */
  index: number;
  picked: StatLetter | null;
  /** When the current question started and when its clock runs out, in milliseconds (Date.now()). */
  startedAt: number;
  deadline: number;
  answers: StatAnswer[];
  status: 'playing' | 'over';
}

export function startStat(now: number): StatState {
  return { index: 0, picked: null, startedAt: now, deadline: now + STAT_SECONDS * 1000, answers: [], status: 'playing' };
}

/** Whole seconds left on the current question, from 20 down to 0. */
export function secondsLeft(state: StatState, now: number): number {
  if (state.status !== 'playing') return 0;
  const left = Math.ceil((state.deadline - now) / 1000);
  return Math.min(STAT_SECONDS, Math.max(0, left));
}

/** Picks (or changes) the answer to the current question. Does nothing once the round is over. */
export function pickAnswer(state: StatState, letter: StatLetter): StatState {
  if (state.status !== 'playing' || !isStatLetter(letter)) return state;
  return { ...state, picked: letter };
}

function moveOn(state: StatState, questions: readonly StatQuestion[], answer: StatAnswer, nextStart: number): StatState {
  const answers = [...state.answers, answer];
  if (answers.length >= questions.length) return { ...state, answers, picked: null, status: 'over' };
  return {
    index: state.index + 1,
    picked: null,
    startedAt: nextStart,
    deadline: nextStart + STAT_SECONDS * 1000,
    answers,
    status: 'playing',
  };
}

/** Next (or "see results"): the current pick counts, or no answer if none is picked. The next clock starts now. */
export function nextQuestion(state: StatState, questions: readonly StatQuestion[], now: number): StatState {
  const current = advanceTime(state, questions, now);
  if (current !== state || current.status !== 'playing') return current;
  const question = questions[state.index];
  if (!question) return state;
  const seconds = Math.min(STAT_SECONDS, Math.max(0, Math.round((now - state.startedAt) / 1000)));
  return moveOn(state, questions, { questionId: question.id, picked: state.picked, seconds, timedOut: false }, now);
}

/**
 * Moves on from every question whose clock has run out by `now`. The next question's clock starts the moment the last
 * one ran out, so a tab that slept still runs down in real time. Returns the same object when nothing changed.
 */
export function advanceTime(state: StatState, questions: readonly StatQuestion[], now: number): StatState {
  let current = state;
  while (current.status === 'playing' && now >= current.deadline) {
    const question = questions[current.index];
    if (!question) break;
    const picked = TIMEOUT_KEEPS_PICK ? current.picked : null;
    current = moveOn(current, questions, { questionId: question.id, picked, seconds: STAT_SECONDS, timedOut: true }, current.deadline);
  }
  return current;
}

/** Ring progress from 1 (full, 20 seconds left) to 0. */
export function ringFraction(left: number): number {
  return Math.min(1, Math.max(0, left / STAT_SECONDS));
}

/**
 * Announce at 10 and 5 seconds, not every second. If the page wakes up late, say the actual seconds left
 * rather than a missed threshold (for example 4 seconds, not 10). At zero, the next question speaks.
 */
export function timerAnnouncement(before: number, left: number): string | null {
  // Real readings are whole seconds between zero and the question limit. Ignore malformed readings.
  if (!Number.isInteger(before) || !Number.isInteger(left) ||
      before > STAT_SECONDS || before < 0 || left <= 0 || left > STAT_SECONDS || left >= before) return null;
  const crossed = ANNOUNCE_AT.some((mark) => before > mark && left <= mark);
  return crossed ? `${left} ${left === 1 ? 'second' : 'seconds'} left.` : null;
}

/** A new question and a countdown tick share a single polite live region; all timing words are decided here. */
export type StatTimerMessage =
  | { kind: 'question'; index: number; left: number; previousTimedOut?: boolean }
  | { kind: 'tick'; before: number; left: number };

export function statTimerMessage(message: StatTimerMessage): string | null {
  if (message.kind === 'tick') return timerAnnouncement(message.before, message.left);
  if (!Number.isInteger(message.index) || message.index < 0 || message.index >= STAT_QUESTIONS ||
      !Number.isInteger(message.left) || message.left <= 0 || message.left > STAT_SECONDS) return null;
  return `${message.previousTimedOut ? 'time ran out. ' : ''}question ${message.index + 1} of ${STAT_QUESTIONS}. ${message.left} ${message.left === 1 ? 'second' : 'seconds'}.`;
}

// ---------- Grading (only at the end) ----------

export interface StatGrade {
  right: boolean;
  /** The right answer, when the grader can give it. Real mode gets it from check_answer; it is null for a question
   * with no answer, because check_answer needs at least one picked letter (D-pending). */
  key: StatLetter | null;
}

/** Grades one answer. Called only after the round is over, once per question, in order. */
export type StatGrader = (question: StatQuestion, picked: StatLetter | null) => Promise<StatGrade>;

export type StatReviewStatus = 'right' | 'wrong' | 'timed-out';

export interface StatReviewRow {
  number: number;
  questionId: string;
  picked: StatLetter | null;
  key: StatLetter | null;
  /** Whether this pick adds to the score, including a kept pick on timeout. */
  right: boolean;
  seconds: number;
  timedOut: boolean;
  /** A timed-out row is visibly labeled even when its kept pick scored. */
  status: StatReviewStatus;
}

/** Pure review-row builder: keeps the timeout rule separate from grading and presentation. */
export function buildStatReviewRow(index: number, answer: StatAnswer, grade: StatGrade): StatReviewRow {
  const right = answer.picked !== null && grade.right === true;
  return {
    number: index + 1,
    questionId: answer.questionId,
    picked: answer.picked,
    key: grade.key,
    right,
    seconds: answer.seconds,
    timedOut: answer.timedOut,
    status: answer.timedOut ? 'timed-out' : right ? 'right' : 'wrong',
  };
}

/** Grades the finished round, one question at a time (no burst of requests in real mode). */
export async function gradeRound(
  questions: readonly StatQuestion[],
  answers: readonly StatAnswer[],
  grader: StatGrader,
): Promise<StatReviewRow[]> {
  const rows: StatReviewRow[] = [];
  for (const [index, answer] of answers.entries()) {
    const question = questions[index];
    if (!question || question.id !== answer.questionId) throw new Error('the answers do not match the questions.');
    const grade = await grader(question, answer.picked);
    rows.push(buildStatReviewRow(index, answer, grade));
  }
  return rows;
}

export const scoreOf = (rows: readonly StatReviewRow[]): number => rows.filter((row) => row.right).length;

/** Average whole seconds per question over every answer, including ones whose clock ran out. */
export function averageSeconds(answers: readonly { seconds: number }[]): number {
  if (answers.length === 0) return 0;
  return Math.round(answers.reduce((total, answer) => total + answer.seconds, 0) / answers.length);
}

/**
 * The verdict line under the score. The line under 6 is a placeholder of our own (D-pending, task-640 status note):
 * plain and neutral until Christian picks the wording.
 */
export function verdict(score: number): string {
  if (score >= 13) return 'top of the unit today.';
  if (score >= 10) return 'solid shift.';
  if (score >= 6) return 'warming up.';
  return 'a hard set today. a new one comes tomorrow.';
}

/** The plain one-line share: no colored squares, nothing personal. */
export function statShareLine(date: Date, score: number): string {
  return `${statGame.name} · ${dayLabel(date)} · ${score}/${STAT_QUESTIONS} · cueory.app`;
}

/** Every review label is plain language, with a symbol as a second signal (never color alone). */
export function reviewWords(row: StatReviewRow): {
  mark: string;
  result: string;
  yours: string;
  answer: string;
  time: string;
  counted: string | null;
} {
  return {
    mark: row.status === 'timed-out' ? '◷' : row.right ? '✓' : '✕',
    result: row.status === 'timed-out' ? 'out of time' : row.right ? 'right' : 'wrong',
    yours: row.picked
      ? 'your answer: ' + letterLabel(row.picked)
      : row.timedOut ? 'no answer (time ran out)' : 'no answer (skipped)',
    answer: row.key ? 'answer: ' + letterLabel(row.key) : 'answer: unavailable',
    time: 'time used: ' + row.seconds + ' s',
    counted: row.timedOut && row.picked
      ? (row.right ? 'picked answer counted as right' : 'picked answer counted as wrong')
      : null,
  };
}

// ---------- The result other games share (Task 626 hook) ----------

/**
 * A finished stat round, in the same shape as every game's RoundResult (src/islands/gameresults.ts: game, day, solved,
 * tries) plus stat's own numbers. `tries` counts the questions not right, like sort's slips: fewer is better. `solved`
 * is true for every finished round (each one ends with a score).
 */
export interface StatRoundResult {
  game: 'stat';
  /** YYYY-MM-DD in the visitor's own time zone (localDay). */
  day: string;
  solved: boolean;
  tries: number;
  score: number;
  total: number;
  averageSeconds: number;
  /** The plain share line, ready to copy. */
  share: string;
  /** True for "practice again" rounds after the first one today. */
  practice: boolean;
}

/** The finished round for the shared results card, or null while it is still being played or graded. */
export function getResult(
  rows: readonly StatReviewRow[] | null,
  answers: readonly StatAnswer[],
  date: Date,
  practice: boolean,
): StatRoundResult | null {
  if (!rows || rows.length !== STAT_QUESTIONS) return null;
  const score = scoreOf(rows);
  return {
    game: 'stat',
    day: localDay(date),
    solved: true,
    tries: STAT_QUESTIONS - score,
    score,
    total: STAT_QUESTIONS,
    averageSeconds: averageSeconds(answers),
    share: statShareLine(date, score),
    practice,
  };
}

// ---------- Sample content ----------

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const sampleText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().startsWith('[sample') && value.trim().endsWith(']') && value.length <= 200;

export interface StatSample {
  questions: StatQuestion[];
  /** The labeled sample key: sample content only. Real keys never come to the browser. */
  sampleKey: Record<string, StatLetter>;
}

/**
 * Reads content/games/stat/sample.json. Refuses anything that isn't a labeled sample: the file must say
 * `"status": "sample"` and every stem and choice must be bracketed sample text such as "[sample question 1]", so a
 * real question can never be dropped into this public repository by mistake.
 */
export function parseStatSample(raw: unknown): StatSample {
  if (!record(raw) || raw.status !== 'sample') throw new Error('stat content must be marked "status": "sample".');
  const list = raw.questions;
  if (!Array.isArray(list) || list.length !== STAT_QUESTIONS) throw new Error(`stat needs exactly ${STAT_QUESTIONS} questions.`);
  const questions: StatQuestion[] = [];
  const sampleKey: Record<string, StatLetter> = {};
  for (const [index, item] of list.entries()) {
    const where = `question ${index + 1}`;
    if (!record(item) || Object.keys(item).some((key) => !['id', 'stem', 'choices', 'sampleKey'].includes(key))) {
      throw new Error(`${where}: only id, stem, choices and sampleKey are allowed.`);
    }
    const { id, stem, choices, sampleKey: key } = item;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id) || Object.hasOwn(sampleKey, id)) {
      throw new Error(`${where}: needs its own short id (lowercase letters, numbers and dashes).`);
    }
    if (!sampleText(stem)) throw new Error(`${where}: the stem must be labeled sample text, like "[sample question 1]".`);
    if (!Array.isArray(choices) || choices.length !== STAT_LETTERS.length) throw new Error(`${where}: needs four choices, a to d.`);
    const parsed = choices.map((choice, at) => {
      if (!record(choice) || choice.id !== STAT_LETTERS[at] || !sampleText(choice.text) || Object.keys(choice).length !== 2) {
        throw new Error(`${where}: choice ${at + 1} must be { "id": "${STAT_LETTERS[at]}", "text": "[sample choice ...]" }.`);
      }
      return { id: STAT_LETTERS[at]!, text: choice.text as string };
    });
    if (!isStatLetter(key)) throw new Error(`${where}: sampleKey must be one of a, b, c or d.`);
    questions.push({ id, stem, choices: parsed });
    sampleKey[id] = key;
  }
  return { questions, sampleKey };
}

/** Sample mode's grader: the labeled sample key, nothing from the network. */
export function sampleGrader(sampleKey: Readonly<Record<string, StatLetter>>): StatGrader {
  return async (question, picked) => {
    const key = sampleKey[question.id];
    if (!key) throw new Error('this sample question has no sample key.');
    return { right: picked === key, key };
  };
}

/**
 * Real mode's grader (not wired to a page yet, D-pending): each answer goes to the permission-checked `check_answer`
 * RPC through the questions player's own adapter (questionsremote.ts → checkanswer.ts), which needs a signed-in
 * student, the published version of every question and the Supabase client as transport. A question with no answer is
 * not sent (check_answer needs at least one letter), so its key stays unknown.
 */
export function remoteStatGrader(questions: readonly StatQuestion[], remote: RemoteQuestions): StatGrader {
  const check = remoteChecker(
    questions.map((question) => ({ id: question.id, type: 'single' as const, stem: question.stem, choices: question.choices })),
    remote,
  );
  return async (question, picked) => {
    if (picked === null) return { right: false, key: null };
    const result = await check(question.id, [picked]);
    const key = result.key.length === 1 && isStatLetter(result.key[0]) ? result.key[0] : null;
    return { right: result.correct, key };
  };
}
