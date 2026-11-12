import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_SETTINGS, type BreakSettings, type BreakStatus } from '../../src/islands/breaks';
import type { BreakLength } from '../../src/islands/breakideas';

const guide = readFileSync(resolve(process.cwd(), 'docs/BREAKS.md'), 'utf8');

// These records are checked against the imported types at compile time.
// If the code gains or renames a phase/setting, the guide test must be updated.
const phaseNames: Record<BreakStatus, string> = {
  off: 'off',
  focusing: 'focusing',
  'break due': 'break due',
  'on break': 'on break',
  paused: 'paused',
};
const settingNames: Record<keyof BreakSettings, string> = {
  focusMinutes: 'focusMinutes',
  breakMinutes: 'breakMinutes',
};
const lengthNames: Record<BreakLength, string> = {
  short: 'short break',
  long: 'long break',
};

function section(title: string): string {
  const heading = `## ${title}\n`;
  const begin = guide.indexOf(heading);
  if (begin === -1) throw new Error(`breaks guide is missing its ${title} section.`);
  const end = guide.indexOf('\n## ', begin + heading.length);
  return guide.slice(begin, end === -1 ? undefined : end);
}

function codeRows(title: string): string[] {
  return Array.from(section(title).matchAll(/^\|\s*`([^`]+)`\s*\|/gm), match => match[1]!);
}

describe('breaks guide stays true to the code', () => {
  it('lists exactly the two timer settings defined in BreakSettings', () => {
    expect(codeRows('Timer settings')).toEqual(Object.values(settingNames));
    const table = section('Timer settings');
    for (const [name, value] of Object.entries(DEFAULT_BREAK_SETTINGS)) {
      expect(table).toContain(`| \`${name}\` | ${value} minutes |`);
    }
  });

  it('lists every current timer phase and no retired phases', () => {
    expect(codeRows('Timer phases')).toEqual(Object.values(phaseNames));
    expect(new Set(codeRows('Timer phases')).size).toBe(Object.keys(phaseNames).length);
  });

  it('describes deadline storage, the fallback and accessible status', () => {
    const text = section('Timer storage and accessibility');
    expect(text).toContain('saved end time');
    expect(text).toContain('sessionStorage');
    expect(text).toContain('two hours');
    expect(text).toContain("progress won't be saved");
    expect(text).toMatch(/reduced motion/i);
    expect(text).toMatch(/screen readers/i);
    expect(text).toMatch(/not every second/i);
  });

  it('describes each length, unclassified samples and no immediate repeat where possible', () => {
    const text = section('Choosing a break idea');
    for (const name of Object.values(lengthNames)) expect(text).toContain(name);
    expect(text).toContain('any break');
    expect(text).toMatch(/untagged ideas fit/i);
    expect(text).toContain('another idea');
    expect(text).toMatch(/different idea when more than one/i);
    expect(text).toMatch(/not saved or sent/i);
  });

  it('distinguishes the existing tools from the unapproved future sharing proposal', () => {
    expect(section('What works now')).toMatch(/sample wording is still awaiting content approval/i);
    expect(section('Proposed sharing experience (not live)')).toMatch(/future/i);
    expect(guide).toMatch(/Sharing an idea with other students is only a proposal/i);
    expect(guide).toMatch(/not enabled/i);
  });
});
