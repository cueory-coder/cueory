import { describe, expect, it, vi } from 'vitest';
import sample from '../../content/games/stat/sample.json' with { type: 'json' };
import {
  STAT_QUESTIONS,
  STAT_SECONDS,
  TIMEOUT_KEEPS_PICK,
  advanceTime,
  averageSeconds,
  buildStatReviewRow,
  getResult,
  gradeRound,
  nextQuestion,
  parseStatSample,
  pickAnswer,
  remoteStatGrader,
  reviewWords,
  ringFraction,
  sampleGrader,
  scoreOf,
  secondsLeft,
  startStat,
  statShareLine,
  timerAnnouncement,
  verdict,
  type StatAnswer,
  type StatGrader,
  type StatQuestion,
  type StatState,
} from '../../src/islands/stat';

const { questions, sampleKey } = parseStatSample(sample);
const T0 = 1_000_000;
const S = 1000;

/** Plays the whole round: `picks[i]` (or null) and next after `secondsEach` seconds. */
function playAll(picks: Array<'a' | 'b' | 'c' | 'd' | null>, secondsEach = 3): StatState {
  let state = startStat(T0);
  let now = T0;
  for (const letter of picks) {
    if (letter) state = pickAnswer(state, letter);
    now += secondsEach * S;
    state = nextQuestion(state, questions, now);
  }
  return state;
}

describe('stat sample content', () => {
  it('has fifteen labeled sample questions with four choices and keeps the key apart from the questions', () => {
    expect(questions).toHaveLength(STAT_QUESTIONS);
    for (const question of questions) {
      expect(question.stem).toMatch(/^\[sample question \d+\]$/);
      expect(question.choices.map((choice) => choice.id)).toEqual(['a', 'b', 'c', 'd']);
      for (const choice of question.choices) expect(choice.text).toMatch(/^\[sample choice [A-D]\]$/);
      expect(Object.keys(question).sort()).toEqual(['choices', 'id', 'stem']);
    }
    expect(Object.keys(sampleKey)).toEqual(questions.map((question) => question.id));
  });

  it('refuses unlabeled (possibly real) text, a wrong count, extra fields and a bad key', () => {
    const copy = () => structuredClone(sample) as { status: string; questions: Array<Record<string, unknown>> };
    const real = copy();
    real.questions[0]!.stem = 'A real-looking question?';
    expect(() => parseStatSample(real)).toThrow(/labeled sample text/);
    const notSample = copy();
    notSample.status = 'approved';
    expect(() => parseStatSample(notSample)).toThrow(/sample/);
    const short = copy();
    short.questions.pop();
    expect(() => parseStatSample(short)).toThrow(/exactly 15/);
    const rationale = copy();
    rationale.questions[0]!.rationale = '[sample]';
    expect(() => parseStatSample(rationale)).toThrow(/only id, stem, choices and sampleKey/);
    const badKey = copy();
    badKey.questions[0]!.sampleKey = 'e';
    expect(() => parseStatSample(badKey)).toThrow(/sampleKey/);
  });
});

describe('stat clock', () => {
  it('starts each question with 20 seconds and counts down from the deadline', () => {
    const state = startStat(T0);
    expect(secondsLeft(state, T0)).toBe(STAT_SECONDS);
    expect(secondsLeft(state, T0 + 0.2 * S)).toBe(20);
    expect(secondsLeft(state, T0 + 1 * S)).toBe(19);
    expect(secondsLeft(state, T0 + 19.5 * S)).toBe(1);
    expect(secondsLeft(state, T0 + 25 * S)).toBe(0);
  });

  it('moves on by itself when the clock runs out and restarts the clock for the next question', () => {
    const state = startStat(T0);
    expect(advanceTime(state, questions, T0 + 19.9 * S)).toBe(state);
    const after = advanceTime(state, questions, T0 + 20 * S);
    expect(after.index).toBe(1);
    expect(after.answers).toEqual([{ questionId: questions[0]!.id, picked: null, seconds: 20, timedOut: true }]);
    expect(secondsLeft(after, T0 + 20 * S)).toBe(20);
  });

  it('a timeout with nothing picked records no answer', () => {
    const after = advanceTime(startStat(T0), questions, T0 + 20 * S);
    expect(after.answers[0]!.picked).toBeNull();
    expect(after.answers[0]!.timedOut).toBe(true);
  });

  it('a pick made before the clock ran out counts on timeout (TIMEOUT_KEEPS_PICK, D-pending)', () => {
    const after = advanceTime(pickAnswer(startStat(T0), 'c'), questions, T0 + 20 * S);
    expect(after.answers[0]!.picked).toBe(TIMEOUT_KEEPS_PICK ? 'c' : null);
  });

  it('a tab left in the background loses its time: every question whose clock ran out moves on, with no extra time', () => {
    const after = advanceTime(startStat(T0), questions, T0 + 65 * S);
    expect(after.index).toBe(3);
    expect(after.answers.map((answer) => answer.timedOut)).toEqual([true, true, true]);
    expect(secondsLeft(after, T0 + 65 * S)).toBe(15);
    const over = advanceTime(startStat(T0), questions, T0 + 10_000 * S);
    expect(over.status).toBe('over');
    expect(over.answers).toHaveLength(STAT_QUESTIONS);
  });

  it('ring fraction runs from full to empty and stays in range', () => {
    expect(ringFraction(20)).toBe(1);
    expect(ringFraction(10)).toBe(0.5);
    expect(ringFraction(0)).toBe(0);
    expect(ringFraction(-3)).toBe(0);
  });

  it('announces the clock at 10 and 5 seconds only, once each', () => {
    const heard: string[] = [];
    let before = STAT_SECONDS;
    for (let left = 20; left >= 0; left--) {
      const line = timerAnnouncement(before, left);
      if (line) heard.push(line);
      before = left;
    }
    expect(heard).toEqual(['10 seconds left.', '5 seconds left.']);
    // A skipped reading (a slow device) still says it once; staying at 10 says nothing again.
    expect(timerAnnouncement(12, 8)).toBe('10 seconds left.');
    expect(timerAnnouncement(10, 10)).toBeNull();
    expect(timerAnnouncement(1, 0)).toBeNull();
  });
});

describe('stat answers', () => {
  it('the pick can change until next; next records the last pick and the seconds used', () => {
    let state = startStat(T0);
    state = pickAnswer(state, 'a');
    state = pickAnswer(state, 'd');
    state = pickAnswer(state, 'b');
    expect(state.picked).toBe('b');
    expect(state.answers).toEqual([]);
    state = nextQuestion(state, questions, T0 + 7.4 * S);
    expect(state.answers).toEqual([{ questionId: questions[0]!.id, picked: 'b', seconds: 7, timedOut: false }]);
    expect(state.index).toBe(1);
    expect(state.picked).toBeNull();
    expect(secondsLeft(state, T0 + 7.4 * S)).toBe(20);
  });

  it('next with nothing picked records no answer', () => {
    const state = nextQuestion(startStat(T0), questions, T0 + 2 * S);
    expect(state.answers[0]!.picked).toBeNull();
    expect(state.answers[0]!.timedOut).toBe(false);
  });

  it('next after the deadline counts as the timeout only, never twice', () => {
    const state = nextQuestion(startStat(T0), questions, T0 + 21 * S);
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0]!.timedOut).toBe(true);
    expect(state.index).toBe(1);
  });

  it('the round ends after fifteen and ignores picks and next afterwards', () => {
    const over = playAll(Array(STAT_QUESTIONS).fill('a'));
    expect(over.status).toBe('over');
    expect(over.answers).toHaveLength(STAT_QUESTIONS);
    expect(pickAnswer(over, 'b')).toBe(over);
    expect(nextQuestion(over, questions, T0 + 999 * S)).toBe(over);
    expect(secondsLeft(over, T0)).toBe(0);
  });
});

describe('stat grading and results', () => {
  const keyOrder = questions.map((question) => sampleKey[question.id]!);

  it('grades only through the injected grader, after the round, in order', async () => {
    const over = playAll(keyOrder);
    const calls: string[] = [];
    const grader: StatGrader = async (question, picked) => {
      calls.push(question.id);
      return { right: picked === sampleKey[question.id], key: sampleKey[question.id]! };
    };
    const rows = await gradeRound(questions, over.answers, grader);
    expect(calls).toEqual(questions.map((question) => question.id));
    expect(scoreOf(rows)).toBe(15);
  });

  it('scores with the sample key; unanswered questions are never right', async () => {
    const picks = keyOrder.map((letter, index) => (index < 11 ? letter : null));
    const rows = await gradeRound(questions, playAll(picks).answers, sampleGrader(sampleKey));
    expect(scoreOf(rows)).toBe(11);
    const yes: StatGrader = async () => ({ right: true, key: 'a' });
    const rowsYes = await gradeRound(questions, playAll(Array(STAT_QUESTIONS).fill(null)).answers, yes);
    expect(scoreOf(rowsYes)).toBe(0);
    expect(reviewWords(rows[14]!)).toEqual({
      mark: '✕',
      result: 'wrong',
      yours: 'no answer (skipped)',
      answer: `answer: ${keyOrder[14]!.toUpperCase()}`,
      time: 'time used: 3 s',
      counted: null,
    });
    expect(reviewWords(rows[0]!).result).toBe('right');
  });

  it('makes a pure review row without changing answers or a score decision', () => {
    const answer: StatAnswer = { questionId: questions[0]!.id, picked: 'a', seconds: 7, timedOut: false };
    const grade = { right: true, key: 'a' as const };
    const before = { ...answer };
    expect(buildStatReviewRow(0, answer, grade)).toEqual({
      number: 1,
      questionId: questions[0]!.id,
      picked: 'a',
      key: 'a',
      right: true,
      seconds: 7,
      timedOut: false,
      status: 'right',
    });
    expect(answer).toEqual(before);
    expect(grade).toEqual({ right: true, key: 'a' });
    expect(buildStatReviewRow(0, { ...answer, picked: null }, grade)).toMatchObject({
      picked: null, right: false, status: 'wrong',
    });
  });

  it('shows all-right and all-wrong rounds with a word, symbol, pick, key and time in each row', async () => {
    const rightRows = await gradeRound(questions, playAll(keyOrder).answers, sampleGrader(sampleKey));
    expect(rightRows).toHaveLength(STAT_QUESTIONS);
    expect(rightRows.map((row) => row.status)).toEqual(Array(STAT_QUESTIONS).fill('right'));
    expect(rightRows.every((row) => row.seconds === 3)).toBe(true);
    expect(rightRows.every((row) => reviewWords(row).mark === '✓')).toBe(true);

    const wrongPicks = keyOrder.map((letter) => letter === 'a' ? 'b' : 'a');
    const wrongRows = await gradeRound(questions, playAll(wrongPicks).answers, sampleGrader(sampleKey));
    expect(scoreOf(wrongRows)).toBe(0);
    expect(wrongRows.map((row) => row.status)).toEqual(Array(STAT_QUESTIONS).fill('wrong'));
    expect(wrongRows.every((row) => reviewWords(row).result === 'wrong')).toBe(true);
    expect(wrongRows.every((row) => reviewWords(row).mark === '✕')).toBe(true);
    expect(reviewWords(wrongRows[0]!)).toMatchObject({
      yours: 'your answer: ' + wrongPicks[0]!.toUpperCase(),
      answer: 'answer: ' + keyOrder[0]!.toUpperCase(),
      time: 'time used: 3 s',
    });
  });

  it('keeps a mixed round in order and does not call a skipped answer a timeout', async () => {
    const picks = keyOrder.map((letter, index) => index < 5 ? letter : index < 10 ? (letter === 'a' ? 'b' : 'a') : null);
    const rows = await gradeRound(questions, playAll(picks).answers, sampleGrader(sampleKey));
    expect(rows.map((row) => row.number)).toEqual(Array.from({ length: STAT_QUESTIONS }, (_, index) => index + 1));
    expect(rows.map((row) => row.status)).toEqual([
      ...Array(5).fill('right'), ...Array(10).fill('wrong'),
    ]);
    expect(scoreOf(rows)).toBe(5);
    expect(reviewWords(rows[10]!)).toMatchObject({
      result: 'wrong', yours: 'no answer (skipped)', time: 'time used: 3 s',
    });
  });

  it('distinguishes timed-out picks and no picks while respecting TIMEOUT_KEEPS_PICK', async () => {
    let state = pickAnswer(startStat(T0), keyOrder[0]!);
    state = advanceTime(state, questions, T0 + 20 * S);
    state = advanceTime(state, questions, T0 + 40 * S);
    const rows = await gradeRound(questions, state.answers, sampleGrader(sampleKey));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual(['timed-out', 'timed-out']);
    expect(rows[0]!.picked).toBe(TIMEOUT_KEEPS_PICK ? keyOrder[0] : null);
    expect(rows[0]!.right).toBe(TIMEOUT_KEEPS_PICK);
    expect(rows[0]!.seconds).toBe(20);
    expect(reviewWords(rows[0]!)).toMatchObject({
      mark: '◷',
      result: 'out of time',
      time: 'time used: 20 s',
      counted: TIMEOUT_KEEPS_PICK ? 'picked answer counted as right' : null,
    });
    expect(reviewWords(rows[1]!)).toMatchObject({
      mark: '◷',
      result: 'out of time',
      yours: 'no answer (time ran out)',
      time: 'time used: 20 s',
      counted: null,
    });

    const wrongPick = keyOrder[0] === 'a' ? 'b' : 'a';
    const missed = advanceTime(pickAnswer(startStat(T0), wrongPick), questions, T0 + 20 * S);
    const missedRows = await gradeRound(questions, missed.answers, sampleGrader(sampleKey));
    expect(missedRows[0]!.status).toBe('timed-out');
    expect(missedRows[0]!.right).toBe(false);
    expect(reviewWords(missedRows[0]!).counted).toBe(TIMEOUT_KEEPS_PICK ? 'picked answer counted as wrong' : null);
    expect(reviewWords(buildStatReviewRow(0, missed.answers[0]!, { right: false, key: null })).answer).toBe('answer: unavailable');
  });

  it('refuses answers that do not match the questions', async () => {
    const wrong: StatAnswer[] = [{ questionId: 'other', picked: 'a', seconds: 1, timedOut: false }];
    await expect(gradeRound(questions, wrong, sampleGrader(sampleKey))).rejects.toThrow();
  });

  it('verdict thresholds', () => {
    expect(verdict(15)).toBe('top of the unit today.');
    expect(verdict(13)).toBe('top of the unit today.');
    expect(verdict(12)).toBe('solid shift.');
    expect(verdict(10)).toBe('solid shift.');
    expect(verdict(9)).toBe('warming up.');
    expect(verdict(6)).toBe('warming up.');
    expect(verdict(5)).toBe('a hard set today. a new one comes tomorrow.');
    expect(verdict(0)).toBe(verdict(5));
  });

  it('average time counts every question, timeouts as 20', () => {
    expect(averageSeconds([])).toBe(0);
    expect(averageSeconds([{ seconds: 3 }, { seconds: 20 }, { seconds: 4 }])).toBe(9);
    expect(averageSeconds(playAll(Array(STAT_QUESTIONS).fill('a'), 4).answers)).toBe(4);
  });

  it('share line is plain text in the agreed format', () => {
    const line = statShareLine(new Date(2026, 10, 11), 12);
    expect(line).toBe('stat · wed 11 nov · 12/15 · cueory.app');
    expect(line).not.toMatch(/[\u{1F7E5}-\u{1F7EB}⬛⬜]/u);
  });

  it('getResult has the shared RoundResult shape plus stat numbers, and is null until graded', async () => {
    const over = playAll(keyOrder.map((letter, index) => (index < 12 ? letter : 'a' === letter ? 'b' : 'a')), 5);
    const date = new Date(2026, 10, 11, 9, 30);
    expect(getResult(null, over.answers, date, false)).toBeNull();
    const rows = await gradeRound(questions, over.answers, sampleGrader(sampleKey));
    expect(getResult(rows.slice(0, 3), over.answers, date, false)).toBeNull();
    expect(getResult(rows, over.answers, date, true)).toEqual({
      game: 'stat',
      day: '2026-11-11',
      solved: true,
      tries: 3,
      score: 12,
      total: 15,
      averageSeconds: 5,
      share: 'stat · wed 11 nov · 12/15 · cueory.app',
      practice: true,
    });
  });
});

describe('stat real mode grader (not wired to a page yet)', () => {
  const ids = Array.from({ length: STAT_QUESTIONS }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const versions = ids.map((id, index) => ({ item_id: id, id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}` }));
  const real: StatQuestion[] = ids.map((id, index) => ({ ...questions[index]!, id }));

  it('asks check_answer with the version id and one lowercase letter, and keeps only right and key', async () => {
    const rpc = vi.fn(async (_name: 'check_answer', args: { item_id: string; version_id: string; picked: string[] }) => ({
      data: { correct: args.picked[0] === 'b', key: ['b'], rationales: { b: '[sample rationale]' }, version_id: args.version_id },
      error: null,
    }));
    const grader = remoteStatGrader(real, { signedIn: true, transport: { rpc }, versions });
    expect(await grader(real[0]!, 'b')).toEqual({ right: true, key: 'b' });
    expect(rpc).toHaveBeenCalledWith('check_answer', { item_id: ids[0], version_id: versions[0]!.id, picked: ['b'] });
    expect(await grader(real[1]!, 'c')).toEqual({ right: false, key: 'b' });
  });

  it('does not call check_answer for an unanswered question and refuses while signed out', async () => {
    const rpc = vi.fn();
    const grader = remoteStatGrader(real, { signedIn: true, transport: { rpc }, versions });
    expect(await grader(real[0]!, null)).toEqual({ right: false, key: null });
    expect(rpc).not.toHaveBeenCalled();
    const out = remoteStatGrader(real, { signedIn: false, transport: { rpc }, versions });
    await expect(out(real[0]!, 'a')).rejects.toThrow(/sign in/);
  });
});
