import { describe, expect, it } from 'vitest';
import { fitPalmText } from '../../src/islands/palmtext';

// A deterministic font: each Unicode code point, including a space, is half an em.
const measure = (text: string, px: number) => Array.from(text).length * px / 2;

describe('glove note palm text', () => {
  it('uses maxPx exactly when the text fits, including a fractional maximum', () => {
    expect(fitPalmText('sample', { width: 200, height: 100 }, measure, { maxPx: 27.7 }))
      .toEqual({ lines: ['sample'], fontPx: 27.7 });
  });

  it('shrinks to the largest fitting half-pixel size without overflowing', () => {
    const result = fitPalmText('sample', { width: 59, height: 100 }, measure, { maxPx: 32 })!;
    expect(result.fontPx).toBe(19.5);
    expect(measure(result.lines[0]!, result.fontPx)).toBeLessThanOrEqual(59);
    expect(measure('sample', result.fontPx + 0.5)).toBeGreaterThan(59);
  });

  it('wraps only between words and keeps level lines within both dimensions', () => {
    const result = fitPalmText('one two three four', { width: 100, height: 60 }, measure,
      { minPx: 16, maxPx: 20, lineHeight: 1.2 })!;
    expect(result.lines.join(' ')).toBe('one two three four');
    expect(result.lines.length).toBeGreaterThan(1);
    for (const line of result.lines) expect(measure(line, result.fontPx)).toBeLessThanOrEqual(100);
    expect(result.lines.length * result.fontPx * 1.2).toBeLessThanOrEqual(60);
    expect(Object.keys(result).sort()).toEqual(['fontPx', 'lines']);
  });

  it('avoids a one-word last line when another wrap fits at the same size', () => {
    // A greedy wrap would use "one two three" / "four".
    expect(fitPalmText('one two three four', { width: 104, height: 32 }, measure,
      { minPx: 16, maxPx: 16, lineHeight: 1 }))
      .toEqual({ lines: ['one two', 'three four'], fontPx: 16 });
  });

  it('allows an unavoidable final single word without dropping or splitting it', () => {
    expect(fitPalmText('sample word', { width: 48, height: 32 }, measure,
      { minPx: 16, maxPx: 16, lineHeight: 1 }))
      .toEqual({ lines: ['sample', 'word'], fontPx: 16 });
  });

  it('honors vertical limits, including a minimum-size failure', () => {
    expect(fitPalmText('a', { width: 100, height: 19 }, measure, { maxPx: 32, lineHeight: 1 }))
      .toEqual({ lines: ['a'], fontPx: 19 });
    expect(fitPalmText('a', { width: 100, height: 15 }, measure)).toBeNull();
    expect(fitPalmText('sample word', { width: 48, height: 31 }, measure,
      { maxPx: 16, lineHeight: 1 })).toBeNull();
  });

  it('defaults the minimum to 16 and never splits a word too wide at that size', () => {
    expect(fitPalmText('sample', { width: 47, height: 1000 }, measure)).toBeNull();
    expect(fitPalmText('sample', { width: 48, height: 1000 }, measure))
      .toEqual({ lines: ['sample'], fontPx: 16 });
  });

  it.each(['', ' ', '   ', '\t\n'])('refuses empty or whitespace-only text: %j', text => {
    expect(fitPalmText(text, { width: 100, height: 100 }, measure)).toBeNull();
  });

  it('trims outer whitespace and collapses spaces without changing word characters', () => {
    expect(fitPalmText('  sample   😀  ', { width: 200, height: 100 }, measure))
      .toEqual({ lines: ['sample 😀'], fontPx: 32 });
  });

  it('fits 60-character text deterministically with a bounded number of measurements', () => {
    const text = 'abc '.repeat(14) + 'abcd';
    expect(Array.from(text)).toHaveLength(60);
    let calls = 0;
    const measured = (line: string, px: number) => { calls++; return measure(line, px); };
    const box = Object.freeze({ width: 160, height: 120 });
    const options = Object.freeze({ minPx: 16, maxPx: 40, lineHeight: 1.15 });
    const result = fitPalmText(text, box, measured, options)!;
    expect(result.lines.join(' ')).toBe(text);
    expect(result).toEqual(fitPalmText(text, box, measure, options));
    expect(calls).toBeLessThan(2000);
    for (const line of result.lines) expect(measure(line, result.fontPx)).toBeLessThanOrEqual(box.width);
    expect(result.lines.length * result.fontPx * options.lineHeight).toBeLessThanOrEqual(box.height);
    // Independently enumerate all word-boundary wraps at the next size to confirm maximality.
    const words = text.split(' ');
    const next = result.fontPx + 0.5;
    const possible = (start: number, lines: number): boolean => {
      if (start === words.length) return lines * next * options.lineHeight <= box.height;
      if ((lines + 1) * next * options.lineHeight > box.height) return false;
      for (let end = start + 1; end <= words.length; end++) {
        if (measure(words.slice(start, end).join(' '), next) <= box.width && possible(end, lines + 1)) return true;
      }
      return false;
    };
    expect(possible(0, 0)).toBe(false);
  });

  it.each([NaN, Infinity, -1, 0])('refuses invalid dimensions or options: %s', value => {
    expect(fitPalmText('a', { width: value, height: 100 }, measure)).toBeNull();
    expect(fitPalmText('a', { width: 100, height: value }, measure)).toBeNull();
    for (const key of ['minPx', 'maxPx', 'lineHeight']) {
      expect(fitPalmText('a', { width: 100, height: 100 }, measure, { [key]: value })).toBeNull();
    }
  });

  it('refuses inverted size bounds and invalid font measurements', () => {
    expect(fitPalmText('a', { width: 100, height: 100 }, measure, { minPx: 20, maxPx: 19 })).toBeNull();
    for (const width of [NaN, Infinity, -1]) {
      expect(fitPalmText('a', { width: 100, height: 100 }, () => width)).toBeNull();
    }
  });
});
