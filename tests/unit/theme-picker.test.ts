import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../src/components/ThemePicker.astro', import.meta.url), 'utf8');

describe('footer theme picker contract', () => {
  it('offers Light, Dark and Follow device as one radio group', () => {
    expect(source).toContain("value: 'light'");
    expect(source).toContain("label: 'light'");
    expect(source).toContain("value: 'dark'");
    expect(source).toContain("label: 'dark'");
    expect(source).toContain("value: 'device'");
    expect(source).toContain("label: 'follow device'");
    expect(source).toContain('<input type="radio" name="theme"');
    expect(source).toContain('<fieldset data-theme-picker hidden>');
  });

  it('keeps every option icon decorative and every option text-visible', () => {
    const options = [...source.matchAll(/value: '([^']+)',\s*label: '([^']+)'/g)].map(([, value, label]) => ({ value, label }));
    expect(options).toEqual([
      { value: 'light', label: 'light' },
      { value: 'dark', label: 'dark' },
      { value: 'device', label: 'follow device' },
    ]);
    expect(source.match(/aria-hidden="true"/g)).toHaveLength(3);
    expect(source).toContain('<span>{option.label}</span>');
  });

  it('applies the selected theme and restores original browser bar colors for device mode', () => {
    expect(source).toContain('applyChoice(root, current)');
    expect(source).toContain('saveChoice(storage, value)');
    expect(source).toContain("choice === 'device' || !page ? original : page");
    expect(source).toContain("picker.addEventListener('change'");
    expect(source).toContain('picker.hidden = false');
  });
});
