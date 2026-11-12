import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  phase: 'ready' as 'ready' | 'playing' | 'grading' | 'done' | 'failed',
  round: 1, rows: null as unknown, state: null as unknown,
  stateAt: 0, refAt: 0, refs: [] as { current: unknown }[],
  effects: [] as (() => void | (() => void))[],
}));

// Execute the real island effects. The clock, grading algorithm and DOM focus have separate suites.
vi.mock('react', () => ({
  useMemo: (calculate: () => unknown) => calculate(),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const at = hooks.stateAt++;
    const value = at === 0 ? hooks.phase : at === 1 ? hooks.state : at === 3 ? hooks.rows : at === 6 ? hooks.round
      : typeof initial === 'function' ? initial() : initial;
    return [value, () => undefined];
  },
  useRef: (initial: unknown) => {
    const at = hooks.refAt++;
    return hooks.refs[at] ?? (hooks.refs[at] = { current: initial });
  },
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));

import StatGame from '../../src/islands/StatGame';
import { buildStatReviewRow, getResult, parseStatSample, startStat } from '../../src/islands/stat';
import { buildResultShareLine, forgetHeldRounds, heldRounds, takePendingResultCards } from '../../src/islands/gameresults';
import sample from '../../content/games/stat/sample.json';

const parsed = parseStatSample(sample);
const answers = parsed.questions.map((question) => ({
  questionId: question.id, picked: parsed.sampleKey[question.id]!, seconds: 2, timedOut: false,
}));
const rows = answers.map((answer, index) => buildStatReviewRow(index, answer, { right: true, key: answer.picked }));
const cleanups: (() => void)[] = [];

function renderAndRunEffects() {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  hooks.stateAt = 0; hooks.refAt = 0; hooks.effects.length = 0;
  StatGame(parsed);
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T09:00:00'));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  hooks.rows = rows;
  hooks.state = { ...startStat(0), status: 'over', answers };
  takePendingResultCards(); forgetHeldRounds();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  hooks.phase = 'ready'; hooks.round = 1; hooks.rows = null; hooks.state = null;
  hooks.refs.length = 0; hooks.effects.length = 0;
  takePendingResultCards(); forgetHeldRounds();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('Stat shared result delivery', () => {
  it.each(['ready', 'playing', 'grading', 'failed'] as const)('does not announce a result while %s', (phase) => {
    hooks.phase = phase;
    if (phase === 'playing') hooks.state = { ...startStat(0), answers };
    renderAndRunEffects();
    expect(takePendingResultCards()).toEqual([]);
    expect(heldRounds()).toEqual([]);
  });

  it('delivers once per graded round, retains practice meaning and never enters private stats', () => {
    hooks.phase = 'done';
    renderAndRunEffects();
    const first = takePendingResultCards();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      game: 'stat', name: 'stat', result: '15/15', path: '/play/stat',
      nextMessage: 'reviewed daily sets will come later.',
    });
    expect(buildResultShareLine(first[0]!)).toBe(getResult(rows, answers, new Date(), false)!.share);
    expect(first[0]).not.toHaveProperty('answers');
    expect(first[0]).not.toHaveProperty('key');
    expect(first[0]).not.toHaveProperty('questions');
    expect(heldRounds()).toEqual([]);
    renderAndRunEffects();
    expect(takePendingResultCards()).toEqual([]);

    hooks.round = 2;
    renderAndRunEffects();
    const practice = takePendingResultCards();
    expect(practice).toHaveLength(1);
    expect(practice[0]!.stats).toContainEqual({ label: 'round', value: 'practice' });
    expect(heldRounds()).toEqual([]);
  });
});
