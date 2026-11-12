import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readResume, RESUME_STORAGE_KEY, RESUME_TTL_MS, type ResumeSnapshot } from '../../src/scripts/resume';
import { ContinueStrip } from '../../src/islands/ContinueBar';
import { continueBarView } from '../../src/islands/continuebar';

const NOW = Date.UTC(2026, 10, 11, 18, 0);
const today = () => new Date(NOW);
const snapshot = (changes: Partial<ResumeSnapshot> = {}): ResumeSnapshot => ({
  version: 1,
  savedAt: NOW - 1000,
  tool: 'cards',
  page: '/learn/study-skills/cards',
  itemIndex: 1,
  totalItems: 4,
  answers: {},
  timer: null,
  phase: 'working',
  ...changes,
});

describe('continue bar display decisions', () => {
  it('shows no bar without a saved session or with an unusable device date', () => {
    expect(continueBarView(null, today())).toBeNull();
    expect(continueBarView(undefined, today())).toBeNull();
    expect(continueBarView(snapshot(), new Date(Number.NaN))).toBeNull();
  });

  it('shows a valid session with its own safe local link, words and progress', () => {
    const view = continueBarView(snapshot(), today());
    expect(view).toMatchObject({
      href: '/learn/study-skills/cards',
      title: 'cards',
      accessibleLabel: 'continue cards, question 2 of 4',
      current: 2,
      total: 4,
      expiresAt: NOW - 1000 + RESUME_TTL_MS,
    });
    const html = renderToStaticMarkup(createElement(ContinueStrip, { view: view! }));
    expect(html).toContain('href="/learn/study-skills/cards"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('value="2"');
    expect(html).toContain('max="4"');
    expect(html).not.toContain('https://');
  });

  it('hides a session at the expiration boundary or with a future timestamp', () => {
    expect(continueBarView(snapshot({ savedAt: NOW - RESUME_TTL_MS + 1 }), today())).not.toBeNull();
    expect(continueBarView(snapshot({ savedAt: NOW - RESUME_TTL_MS }), today())).toBeNull();
    expect(continueBarView(snapshot({ savedAt: NOW + 1 }), today())).toBeNull();
  });

  it('rejects unknown study modes and off-site links instead of presenting them', () => {
    expect(continueBarView({ ...snapshot(), tool: 'not-a-study-mode' }, today())).toBeNull();
    expect(continueBarView(snapshot({ page: 'https://not-cueory.example' }), today())).toBeNull();
    expect(continueBarView(snapshot({ page: '/admin' }), today())).toBeNull();
  });

  it('rejects malformed records, invalid indexes, and cyclic data', () => {
    expect(continueBarView({ ...snapshot(), answers: { answerKey: { secret: ['hidden'] } } }, today())).toBeNull();
    expect(continueBarView({ ...snapshot(), totalItems: 0 }, today())).toBeNull();
    expect(continueBarView({ ...snapshot(), itemIndex: 4 }, today())).toBeNull();
    const cyclic: Record<string, unknown> = { ...snapshot() };
    cyclic['cycle'] = cyclic;
    expect(continueBarView(cyclic, today())).toBeNull();
  });

  it('keeps results labeling truthful instead of calling results a question', () => {
    expect(continueBarView(snapshot({ phase: 'results' }), today())?.accessibleLabel).toBe('continue cards, results');
  });

  it('stays hidden when storage is blocked', () => {
    const blocked = { getItem: (_key: string): string => { throw new Error('storage blocked'); },
      setItem: () => { throw new Error('storage blocked'); }, removeItem: () => {} };
    expect(continueBarView(readResume(blocked, NOW), today())).toBeNull();
    expect(continueBarView(readResume(undefined, NOW), today())).toBeNull();
    const empty = { getItem: (_key: string) => null, setItem: () => {}, removeItem: () => {} };
    expect(continueBarView(readResume(empty, NOW), today())).toBeNull();
    expect(RESUME_STORAGE_KEY).toBe('cueory-resume');
  });
});
