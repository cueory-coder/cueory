import { describe, expect, it } from 'vitest';
import { advance, goTo, next, parseSteps, pause, play, previous, startSteps, stepInWords, type DiagramStep } from '../../src/visuals/steps';

const steps: DiagramStep[] = [
  { id: 'seed', caption: 'a seed rests', durationMs: 1000 },
  { id: 'small-sprout', caption: 'a sprout appears', durationMs: 2500 },
  { id: 'two-leaves', caption: 'two leaves open.', durationMs: 10000 },
];

describe('diagram step validation', () => {
  it('accepts one to twelve clean steps and returns a copy', () => {
    const input = structuredClone(steps);
    const parsed = parseSteps(input);
    expect(parsed).toEqual(steps);
    expect(parsed).not.toBe(input);
    expect(parsed[0]).not.toBe(input[0]);
  });

  it.each([null, {}, [], Array(13).fill(steps[0])])('rejects a bad step count: %j', (data) => {
    expect(() => parseSteps(data)).toThrow(/1 to 12 steps/);
  });

  it('rejects badly formed and repeated ids', () => {
    expect(() => parseSteps([{ ...steps[0], id: 'A Seed' }])).toThrow(/lowercase letters/);
    expect(() => parseSteps([{ ...steps[0], id: '-seed' }])).toThrow(/lowercase letters/);
    expect(() => parseSteps([steps[0], { ...steps[1], id: steps[0]!.id }])).toThrow(/repeated/);
  });

  it('rejects empty and overlong captions', () => {
    expect(() => parseSteps([{ ...steps[0], caption: '   ' }])).toThrow(/needs a caption/);
    expect(() => parseSteps([{ ...steps[0], caption: 'a'.repeat(201) }])).toThrow(/200 characters/);
  });

  it('rejects durations outside the whole-number range', () => {
    expect(() => parseSteps([{ ...steps[0], durationMs: 999 }])).toThrow(/1000 to 10000/);
    expect(() => parseSteps([{ ...steps[0], durationMs: 10001 }])).toThrow(/1000 to 10000/);
    expect(() => parseSteps([{ ...steps[0], durationMs: 1500.5 }])).toThrow(/whole number/);
  });

  it.each([null, undefined, [], 'step', 7])('rejects a non-object row without accepting partial data: %j', value => {
    expect(() => parseSteps([steps[0], value])).toThrow(/step 2 must be an object/);
  });

  it.each([undefined, null, 42, {}])('rejects a missing or non-text caption: %j', caption => {
    expect(() => parseSteps([{ ...steps[0], caption }])).toThrow(/needs a caption/);
  });

  it.each([undefined, null, '1000', NaN, Infinity, -Infinity])('rejects a missing, non-numeric or non-finite duration: %j', durationMs => {
    expect(() => parseSteps([{ ...steps[0], durationMs }])).toThrow(/whole number/);
  });

  it('accepts exact size and timing limits, trims captions and drops untrusted extra fields', () => {
    const input = Array.from({ length: 12 }, (_, index) => Object.freeze({
      id: `step-${index}`, caption: `  ${'a'.repeat(200)}  `,
      durationMs: index % 2 ? 10000 : 1000, extra: 'not part of a diagram step',
    }));
    const parsed = parseSteps(Object.freeze(input));
    expect(parsed).toHaveLength(12);
    expect(parsed[0]).toEqual({ id: 'step-0', caption: 'a'.repeat(200), durationMs: 1000 });
    expect(parsed[11]).toEqual({ id: 'step-11', caption: 'a'.repeat(200), durationMs: 10000 });
    expect(parsed.every(step => !('extra' in step))).toBe(true);
    expect(input[0]!.caption).toBe(`  ${'a'.repeat(200)}  `);
    expect(parseSteps([input[0]])).toHaveLength(1);
  });
});

describe('diagram step state', () => {
  it('starts paused on step one', () => {
    expect(startSteps()).toEqual({ index: 0, playing: false });
  });

  it('moves next and previous, stops at both ends, and pauses', () => {
    expect(previous({ index: 0, playing: true }, steps)).toEqual({ index: 0, playing: false });
    expect(next({ index: 0, playing: true }, steps)).toEqual({ index: 1, playing: false });
    expect(next({ index: 2, playing: true }, steps)).toEqual({ index: 2, playing: false });
    expect(previous({ index: 2, playing: true }, steps)).toEqual({ index: 1, playing: false });
  });

  it('goes to an explicit step, clamps at the ends, and pauses', () => {
    const playing = { index: 1, playing: true };
    expect(goTo(playing, steps, 2)).toEqual({ index: 2, playing: false });
    expect(goTo(playing, steps, -20)).toEqual({ index: 0, playing: false });
    expect(goTo(playing, steps, 20)).toEqual({ index: 2, playing: false });
  });

  it.each([NaN, Infinity, -Infinity])('a non-finite seek preserves the visible step and pauses: %s', target => {
    const state = Object.freeze({ index: 1, playing: true });
    expect(goTo(state, steps, target)).toEqual({ index: 1, playing: false });
    expect(state).toEqual({ index: 1, playing: true });
  });

  it('truncates fractional seeks and completes a single-step playback without advancing out of range', () => {
    expect(goTo({ index: 0, playing: true }, steps, 1.9)).toEqual({ index: 1, playing: false });
    expect(goTo({ index: 1, playing: true }, steps, -0.9)).toEqual({ index: 0, playing: false });
    const onlyStep = [steps[0]!];
    expect(advance(play(startSteps(), onlyStep), onlyStep)).toEqual({ index: 0, playing: false });
  });

  it('plays in place, but restarts from step one when the last step is showing', () => {
    expect(play({ index: 1, playing: false }, steps)).toEqual({ index: 1, playing: true });
    expect(play({ index: 2, playing: false }, steps)).toEqual({ index: 0, playing: true });
    expect(pause({ index: 1, playing: true })).toEqual({ index: 1, playing: false });
  });

  it('advances during playback and stops on the last step without looping', () => {
    expect(advance({ index: 0, playing: true }, steps)).toEqual({ index: 1, playing: true });
    expect(advance({ index: 1, playing: true }, steps)).toEqual({ index: 2, playing: false });
    expect(advance({ index: 2, playing: true }, steps)).toEqual({ index: 2, playing: false });
    const paused = { index: 0, playing: false };
    expect(advance(paused, steps)).toBe(paused);
  });

  it('describes the visible step in words, adding punctuation only when needed', () => {
    expect(stepInWords(steps, { index: 1, playing: false })).toBe('step 2 of 3: a sprout appears.');
    expect(stepInWords(steps, { index: 2, playing: false })).toBe('step 3 of 3: two leaves open.');
  });
});
