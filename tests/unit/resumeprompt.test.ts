import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumeChoices } from '../../src/islands/ResumePrompt';
import { matchingResumePage, resumeDecision, resumePromptText, savedDayWords, shouldRecoverResumeFocus } from '../../src/islands/resumeprompt';
import type { ResumeSnapshot, ResumeTool } from '../../src/scripts/resume';

const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime();
const snapshot = (tool: ResumeTool, overrides: Partial<ResumeSnapshot> = {}): ResumeSnapshot => ({
  version: 1,
  tool,
  page: '/learn/study-skills/' + tool,
  itemIndex: 2,
  totalItems: 5,
  answers: {},
  timer: null,
  phase: 'working',
  savedAt: NOW,
  ...overrides,
});

describe('resume prompt words and safe page matching', () => {
  it.each(['fill-in', 'cards', 'matching', 'organizer', 'label-it'] as const)('names the %s study mode and exact position', (tool) => {
    const words = resumePromptText(snapshot(tool), NOW);
    expect(words.heading).toBe('pick up where you left off?');
    expect(words.summary).toContain(tool.replaceAll('-', ' '));
    expect(words.summary).toContain('question 3 of 5');
    expect(words.summary).toContain('saved today');
    expect(words.continueLabel).toBe('continue question 3');
    expect(words.startOverLabel).toBe('start over');
  });

  it('distinguishes a finished result from a working question', () => {
    const words = resumePromptText(snapshot('cards', { phase: 'results' }), NOW);
    expect(words.summary).toContain('results');
    expect(words.continueLabel).toBe('continue with results');
  });

  it('describes a save from another calendar day, including just before midnight', () => {
    const lateYesterday = new Date(2026, 10, 10, 23, 55).getTime();
    const shortlyAfterMidnight = new Date(2026, 10, 11, 0, 5).getTime();
    expect(savedDayWords(lateYesterday, shortlyAfterMidnight)).toBe('saved yesterday');
    const older = new Date(2026, 10, 7, 12).getTime();
    expect(resumePromptText(snapshot('fill-in', { savedAt: older }), NOW).summary).toContain('saved 4 days ago');
  });

  it('uses a safe date fallback for malformed timestamps instead of displaying NaN', () => {
    expect(savedDayWords(NaN, NOW)).toBe('saved recently');
    expect(savedDayWords(Number.POSITIVE_INFINITY, NOW)).toBe('saved recently');
    expect(savedDayWords(Number.MAX_VALUE, NOW)).toBe('saved recently');
    expect(savedDayWords(NOW, Number.MAX_VALUE)).toBe('saved recently');
    expect(savedDayWords(NOW, NOW)).toBe('saved today');
  });

  it('only offers a save on its own path (an optional fragment is ignored)', () => {
    const current = snapshot('cards', { page: '/learn/study-skills/cards#sample' });
    expect(matchingResumePage(current, '/learn/study-skills/cards')).toBe(current);
    expect(matchingResumePage(current, '/learn/study-skills/fill-in')).toBeNull();
    expect(matchingResumePage(null, '/learn/study-skills/cards')).toBeNull();
  });
});

describe('resume choice transitions', () => {
  it('continues without trying to clear the saved snapshot', () => {
    expect(resumeDecision('continue')).toEqual({ action: 'continue', close: true, error: '' });
  });

  it('starts over only after the saved place has been cleared', () => {
    expect(resumeDecision('start-over', true)).toEqual({ action: 'start-over', close: true, error: '' });
  });

  it('keeps the prompt visible and reports blocked storage', () => {
    const choice = resumeDecision('start-over', false);
    expect(choice.action).toBeNull();
    expect(choice.close).toBe(false);
    expect(choice.error).toContain('could not clear');
  });

  it('only falls back to moving focus when the owning board did not', () => {
    expect(shouldRecoverResumeFocus(true)).toBe(false);
    expect(shouldRecoverResumeFocus(false)).toBe(true);
  });
});

describe('accessible shared prompt markup', () => {
  it('shows two native 44px decision buttons and a labelled section', () => {
    const html = renderToStaticMarkup(createElement(ResumeChoices, {
      snapshot: snapshot('cards', { answers: { 'sample-item': '[sample response]' } }),
      problem: '',
      onContinue: () => {},
      onStartOver: () => {},
    }));
    expect(html).toContain('aria-labelledby="cueory-resume-heading"');
    expect(html).toContain('aria-describedby="cueory-resume-summary"');
    expect(html).toContain('id="cueory-resume-summary"');
    expect(html).toContain('pick up where you left off?');
    expect(html).toContain('continue question 3');
    expect(html).toContain('start over');
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html.match(/min-h-11/g)).toHaveLength(2);
    expect(html).not.toContain('[sample response]');
    expect(html).not.toContain('sample-item');
  });

  it('announces a failed start-over when storage cannot be cleared', () => {
    const html = renderToStaticMarkup(createElement(ResumeChoices, {
      snapshot: snapshot('fill-in'),
      problem: resumeDecision('start-over', false).error,
      onContinue: () => {},
      onStartOver: () => {},
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('could not clear the saved place');
  });
});
