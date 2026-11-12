import { describe, expect, it } from 'vitest';
import data from '../../content/games/hello-cards/starters.json' with { type: 'json' };
import { fitStoryText } from '../../src/islands/share';

const measure = (text: string, size: number) => text.length * size * 0.55;
const options = {
  maxWidth: 880,
  maxLines: 3,
  startSize: 132,
  minSize: 56,
  lineHeightRatio: 1.15,
  measure,
};

describe('story result text fitting', () => {
  it('normalizes whitespace, wraps complete words and preserves all text', () => {
    const layout = fitStoryText('  hello   from\ncueory today  ', { ...options, maxWidth: 500 });
    expect(layout).not.toBeNull();
    expect(layout!.lines.join(' ')).toBe('hello from cueory today');
    for (const line of layout!.lines) expect(measure(line, layout!.fontSize)).toBeLessThanOrEqual(500);
  });

  it('reduces the font until the complete result fits the allowed line count', () => {
    const layout = fitStoryText('abcdefghij klmnopqrst', {
      ...options,
      maxWidth: 120,
      maxLines: 1,
      startSize: 20,
      minSize: 10,
    });
    expect(layout).not.toBeNull();
    expect(layout!.fontSize).toBe(10);
    expect(layout!.lines).toEqual(['abcdefghij klmnopqrst']);
  });

  it('returns null instead of cropping empty, overlong or over-limit text', () => {
    expect(fitStoryText('   ', options)).toBeNull();
    expect(fitStoryText('x'.repeat(200), options)).toBeNull();
    expect(fitStoryText('one two three four five six', { ...options, maxWidth: 80, maxLines: 1 })).toBeNull();
  });

  it('fits every published Hello prompt without dropping text', () => {
    for (const starter of data.starters) {
      const layout = fitStoryText(starter.text, options);
      expect(layout, starter.id).not.toBeNull();
      expect(layout!.lines.join(' '), starter.id).toBe(starter.text.replace(/\s+/g, ' ').trim());
      expect(layout!.lines.length, starter.id).toBeLessThanOrEqual(options.maxLines);
      expect(layout!.fontSize, starter.id).toBeGreaterThanOrEqual(options.minSize);
      for (const line of layout!.lines) {
        expect(measure(line, layout!.fontSize), starter.id).toBeLessThanOrEqual(options.maxWidth);
      }
    }
  });
});
