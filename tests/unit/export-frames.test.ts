import { describe, expect, it } from 'vitest';
import { durationMs, FRAME_SIZES, frameName, frameTimes, parseArguments } from '../../scripts/export-frames/plan';

const required = ['--url', 'http://localhost:4321/diagram', '--selector', '#diagram', '--out', 'out/frames'];

describe('frame export arguments', () => {
  it('reads required arguments and defaults to 30 fps', () => {
    expect(parseArguments(required)).toEqual({ url: required[1], selector: '#diagram', out: 'out/frames', fps: 30 });
    expect(parseArguments([...required, '--fps', '24', '--seconds', '2'])).toMatchObject({ fps: 24, seconds: 2 });
  });

  for (const option of ['--url', '--selector', '--out']) {
    it(`requires ${option}`, () => {
      const index = required.indexOf(option);
      expect(() => parseArguments(required.filter((_, i) => i !== index && i !== index + 1))).toThrow(/required/);
      const empty = [...required];
      empty[index + 1] = '';
      expect(() => parseArguments(empty)).toThrow(/required/);
    });
  }

  it.each(['0', '61', 'Infinity', 'NaN', '', 'no'])('rejects fps %j', (value) => {
    expect(() => parseArguments([...required, `--fps=${value}`])).toThrow(/fps/);
  });
  it.each(['-1', '61', 'Infinity', 'NaN', '', 'no'])('rejects seconds %j', (value) => {
    expect(() => parseArguments([...required, `--seconds=${value}`])).toThrow(/seconds/);
  });
  it.each(['1', '60', '29.97'])('accepts fps %s within the limits', (value) => {
    expect(parseArguments([...required, '--fps', value]).fps).toBe(Number(value));
  });
  it.each(['0', '60'])('accepts seconds %s at the limits', (value) => {
    expect(parseArguments([...required, '--seconds', value]).seconds).toBe(Number(value));
  });
  it.each([['--other', 'x'], ['--fps'], ['extra'], ['--out', 'again']])('rejects malformed options %j', (...args) => {
    expect(() => parseArguments([...required, ...args])).toThrow();
  });
  it.each(['not a url', 'javascript:alert(1)', 'ftp://example.test'])('rejects an unusable page address %s', (url) => {
    expect(() => parseArguments(['--url', url, '--selector', '#diagram', '--out', 'out/frames'])).toThrow(/page address/);
  });
});

describe('frame plan', () => {
  it('uses the longest finite end time and caps it at sixty seconds', () => {
    expect(durationMs([200, 2000, 500])).toBe(2000);
    expect(durationMs([120_000])).toBe(60_000);
    expect(durationMs([])).toBe(0);
    expect(durationMs([9000], 2)).toBe(2000);
  });
  it('requires a duration for infinite animations', () => {
    expect(() => durationMs([500, Infinity])).toThrow(/--seconds/);
    expect(durationMs([Infinity], 2)).toBe(2000);
    expect(() => durationMs([100], -1)).toThrow();
  });
  it('plans sixty frames at 30 fps for two seconds, without the endpoint', () => {
    const times = frameTimes(2000, 30);
    expect(times).toHaveLength(60);
    expect(times[0]).toBe(0);
    expect(times[1]).toBeCloseTo(1000 / 30);
    expect(times.at(-1)).toBeCloseTo(59_000 / 30);
    expect(times.every((time) => time < 2000)).toBe(true);
    expect(frameTimes(0, 30)).toEqual([]);
    expect(frameTimes(1001, 1)).toEqual([0, 1000]);
    expect(frameTimes(60_000, 60)).toHaveLength(3600);
  });
  it('validates frame plan limits', () => {
    expect(() => frameTimes(-1, 30)).toThrow();
    expect(() => frameTimes(60_001, 30)).toThrow();
    expect(() => frameTimes(1000, 0)).toThrow();
  });
  it('numbers PNG files with five digits, starting at one', () => {
    expect(frameName(0)).toBe('00001.png');
    expect(frameName(59)).toBe('00060.png');
    expect(frameName(3599)).toBe('03600.png');
    expect(() => frameName(-1)).toThrow();
    expect(() => frameName(1.5)).toThrow();
  });
  it('uses the two video sizes at one CSS pixel per device pixel', () => {
    expect(FRAME_SIZES).toEqual([
      { name: 'portrait', width: 1080, height: 1920 },
      { name: 'landscape', width: 1920, height: 1080 },
    ]);
  });
});
