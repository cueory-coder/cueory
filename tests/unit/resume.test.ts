import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  attachResumeLifecycle, clearResume, parseResume, readResume, resumeName, resumePosition,
  RESUME_STORAGE_KEY, RESUME_TTL_MS, saveResume, type ResumeDraft,
} from '../../src/scripts/resume';
import { ContinueStrip } from '../../src/islands/ContinueBar';
import { ResumeChoices } from '../../src/islands/ResumePrompt';
import type { KeyValueStorage } from '../../src/scripts/storage';

const NOW = Date.UTC(2026, 10, 1, 15, 0, 0);

function memory(): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
}
const draft = (): ResumeDraft => ({
  tool: 'cards',
  page: '/learn/study-skills/cards',
  module: 'module-1',
  step: 'question-4',
  itemIndex: 3,
  itemId: 'card-04',
  totalItems: 20,
  answers: {
    'card-01': 'a',
    'card-02': ['b', 'd'],
    'card-03': { 'left-term': 'right-answer' },
  },
  timer: { status: 'paused', elapsedMs: 120_000, durationMs: 300_000 },
  phase: 'working',
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resume snapshot persistence', () => {
  it('keeps the exact step, answers and timer through a JSON storage round trip', () => {
    const storage = memory();
    expect(saveResume(storage, draft(), NOW)).toBe(true);
    expect(readResume(storage, NOW)).toEqual({
      ...draft(), version: 1, savedAt: NOW,
    });
    const serialized = storage.getItem(RESUME_STORAGE_KEY)!;
    expect(serialized).toContain('"itemIndex":3');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('rationale');
  });

  it('does not alter the original draft or any unrelated localStorage keys', () => {
    const storage = memory();
    const input = draft();
    const before = JSON.stringify(input);
    storage.setItem('cueory-theme', 'dark');
    expect(saveResume(storage, input, NOW)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(clearResume(storage)).toBe(true);
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('cueory-theme')).toBe('dark');
  });

  it('expires at 14 days exactly and removes an expired record', () => {
    const storage = memory();
    saveResume(storage, draft(), NOW);
    expect(readResume(storage, NOW + RESUME_TTL_MS - 1)).not.toBeNull();
    expect(readResume(storage, NOW + RESUME_TTL_MS)).toBeNull();
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
  });

  it('rejects data whose timestamp is in the future', () => {
    const storage = memory();
    saveResume(storage, draft(), NOW);
    expect(readResume(storage, NOW - 1)).toBeNull();
  });

  it('rejects corrupted or oversized records and cleans them up', () => {
    const storage = memory();
    for (const raw of ['not json', 'null', '{"version":0}', 'x'.repeat(33_000)]) {
      storage.setItem(RESUME_STORAGE_KEY, raw);
      expect(readResume(storage, NOW)).toBeNull();
      expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    }
  });

  it('rejects a snapshot carrying extra fields, such as account identifiers or answer keys', () => {
    const storage = memory();
    saveResume(storage, draft(), NOW);
    const parsed = JSON.parse(storage.getItem(RESUME_STORAGE_KEY)!);
    expect(parseResume(JSON.stringify({ ...parsed, email: 'private-account-value' }), NOW)).toBeNull();
    expect(parseResume(JSON.stringify({ ...parsed, answerKey: 'a' }), NOW)).toBeNull();
  });

  it('rejects malformed timer status without throwing or accepting a coerced array', () => {
    const storage = memory();
    expect(saveResume(storage, draft(), NOW)).toBe(true);
    const record = JSON.parse(storage.getItem(RESUME_STORAGE_KEY)!);
    for (const status of [
      ['running'],
      { toString: null },
      { valueOf: 'paused' },
      null,
      5,
      '',
      'unknown',
    ]) {
      const raw = JSON.stringify({
        ...record,
        timer: { status, elapsedMs: 1000, durationMs: 5000 },
      });
      expect(() => parseResume(raw, NOW)).not.toThrow();
      expect(parseResume(raw, NOW)).toBeNull();
    }
  });

  it('refuses off-site and unsafe resume destinations without writing storage', () => {
    const bad = [
      'https://example.com', '//example.com', '/../../admin',
      '/play?next=https://example.com', '/learn//cards', '/admin',
      '/start', '/play#one&two', '/learn/card%2Fsecret',
    ];
    for (const page of bad) {
      const storage = memory();
      expect(saveResume(storage, { ...draft(), page }, NOW), page).toBe(false);
      expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    }
    expect(saveResume(memory(), { ...draft(), page: '/play#pulse' }, NOW)).toBe(true);
  });

  it('rejects impossible item positions, timer values and unsupported response structures', () => {
    const cases: ResumeDraft[] = [
      { ...draft(), itemIndex: 20 },
      { ...draft(), itemIndex: -1 },
      { ...draft(), totalItems: 0 },
      { ...draft(), timer: { status: 'running', elapsedMs: -1, durationMs: 1000 } },
      { ...draft(), timer: { status: 'paused', elapsedMs: 10, durationMs: 0 } },
      { ...draft(), answers: { card: { nested: { bad: 'x' } } } as unknown as ResumeDraft['answers'] },
      { ...draft(), answers: Object.fromEntries([['__proto__', 'no'], ['normal', 'yes']]) },
    ];
    for (const candidate of cases) expect(saveResume(memory(), candidate, NOW)).toBe(false);
  });

  it('never resumes a timed sharpening round in progress; finished results are allowed', () => {
    const storage = memory();
    const active = { ...draft(), tool: 'sharpening' as const, page: '/sharpening', phase: 'working' as const };
    expect(saveResume(storage, active, NOW)).toBe(false);
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    expect(saveResume(storage, { ...active, phase: 'results' }, NOW)).toBe(true);
    expect(readResume(storage, NOW)?.phase).toBe('results');
    expect(resumePosition(readResume(storage, NOW)!)).toBe('results');
  });

  it('supports every named study mode without introducing another localStorage schema', () => {
    const tools: ResumeDraft['tool'][] = [
      'cards', 'learn', 'matching', 'organizer', 'fill-in',
      'label-it', 'questions', 'review', 'game',
    ];
    for (const tool of tools) {
      const storage = memory();
      expect(saveResume(storage, { ...draft(), tool }, NOW)).toBe(true);
      expect(readResume(storage, NOW)?.tool).toBe(tool);
    }
  });

  it('gracefully handles storage disabled during reads, writes and deletion', () => {
    const blocked: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(saveResume(undefined, draft(), NOW)).toBe(false);
    expect(saveResume(blocked, draft(), NOW)).toBe(false);
    expect(readResume(undefined, NOW)).toBeNull();
    expect(readResume(blocked, NOW)).toBeNull();
    expect(clearResume(undefined)).toBe(false);
    expect(clearResume(blocked)).toBe(false);
  });

  it('returns false and does not change storage for cyclic input', () => {
    const storage = memory();
    const input = draft();
    (input as unknown as Record<string, unknown>).cycle = input;
    expect(saveResume(storage, input, NOW)).toBe(false);
    expect(storage.values.size).toBe(0);
  });
});

describe('safe page lifecycle saves', () => {
  function lifecyclePage() {
    const windowEvents = new EventTarget();
    const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', windowEvents);
    vi.stubGlobal('document', documentEvents);
    return {
      windowEvents, documentEvents,
      hide: () => {
        documentEvents.visibilityState = 'hidden';
        documentEvents.dispatchEvent(new Event('visibilitychange'));
      },
    };
  }

  it('refreshes an explicit checkpoint on pagehide or hidden visibility; cleanup removes listeners', () => {
    const { windowEvents, documentEvents, hide } = lifecyclePage();
    const storage = memory();
    const current = vi.fn(() => draft());
    let time = NOW;
    const unsubscribe = attachResumeLifecycle(storage, current, () => time);
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(storage.values.size).toBe(0);
    expect(current).not.toHaveBeenCalled();
    expect(saveResume(storage, draft(), NOW)).toBe(true);
    time++;
    hide();
    expect(readResume(storage, time)).toMatchObject({ itemId: 'card-04', savedAt: time });
    expect(current).toHaveBeenCalledTimes(1);
    time++;
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(readResume(storage, time)).toMatchObject({ itemIndex: 3, savedAt: time });
    unsubscribe();
    storage.removeItem(RESUME_STORAGE_KEY);
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    expect(current).toHaveBeenCalledTimes(2);
  });

  it.each(['remove', 'clear'] as const)('does not recreate a deleted checkpoint after storage %s, even before its event arrives', (deletion) => {
    const { windowEvents, hide } = lifecyclePage();
    const storage = memory();
    const retained = draft();
    const unsubscribe = attachResumeLifecycle(storage, () => retained, () => NOW + 1);
    expect(saveResume(storage, retained, NOW)).toBe(true);
    if (deletion === 'clear') storage.values.clear();
    else storage.removeItem(RESUME_STORAGE_KEY);

    // pagehide can precede delivery of the other tab's storage event.
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    hide();
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();

    windowEvents.dispatchEvent(Object.assign(new Event('storage'), {
      key: deletion === 'clear' ? null : RESUME_STORAGE_KEY, newValue: null, storageArea: storage,
    }));
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    unsubscribe();
  });

  it.each(['another-mode', 'same-page-newer-answer'] as const)('leaves a replacement checkpoint untouched: %s', (replacement) => {
    const { windowEvents, hide } = lifecyclePage();
    const storage = memory();
    const retained = draft();
    expect(saveResume(storage, retained, NOW)).toBe(true);
    const unsubscribe = attachResumeLifecycle(storage, () => retained, () => NOW + 2);
    const newer: ResumeDraft = replacement === 'another-mode'
      ? { ...draft(), tool: 'fill-in', page: '/learn/study-skills/fill-in' }
      : { ...draft(), answers: { 'card-01': 'changed-response' } };
    expect(saveResume(storage, newer, NOW + 1)).toBe(true);
    const stored = storage.getItem(RESUME_STORAGE_KEY);

    hide();
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBe(stored);
    unsubscribe();
  });

  it('waits for an explicit fresh save and can refresh it after an earlier checkpoint was deleted', () => {
    const { windowEvents } = lifecyclePage();
    const storage = memory();
    let current = draft();
    const unsubscribe = attachResumeLifecycle(storage, () => current, () => NOW + 2);
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    expect(saveResume(storage, current, NOW)).toBe(true);
    clearResume(storage);
    current = { ...draft(), answers: { 'card-01': 'fresh-response' } };
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(storage.getItem(RESUME_STORAGE_KEY)).toBeNull();

    expect(saveResume(storage, current, NOW + 1)).toBe(true);
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(readResume(storage, NOW + 2)).toMatchObject({ answers: current.answers, savedAt: NOW + 2 });
    unsubscribe();
  });

  it('does not repair or refresh invalid or expired storage during page exit', () => {
    const { windowEvents } = lifecyclePage();
    const storage = memory();
    const unsubscribe = attachResumeLifecycle(storage, () => draft(), () => NOW + RESUME_TTL_MS);
    saveResume(storage, draft(), NOW);
    const expired = storage.getItem(RESUME_STORAGE_KEY)!;
    for (const raw of ['not json', expired]) {
      storage.setItem(RESUME_STORAGE_KEY, raw);
      windowEvents.dispatchEvent(new Event('pagehide'));
      expect(storage.getItem(RESUME_STORAGE_KEY)).toBe(raw);
    }
    unsubscribe();
  });

  it('leaves matching checkpoints usable after unrelated storage changes', () => {
    const { windowEvents } = lifecyclePage();
    const storage = memory();
    saveResume(storage, draft(), NOW);
    const unsubscribe = attachResumeLifecycle(storage, () => draft(), () => NOW + 1);
    storage.setItem('cueory-theme', 'dark');
    windowEvents.dispatchEvent(Object.assign(new Event('storage'), {
      key: 'cueory-theme', newValue: 'dark', storageArea: storage,
    }));
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(readResume(storage, NOW + 1)?.savedAt).toBe(NOW + 1);
    expect(storage.getItem('cueory-theme')).toBe('dark');
    unsubscribe();
  });

  it('does not throw or attempt a write when storage is absent or cannot be read', () => {
    const { windowEvents, hide } = lifecyclePage();
    const blocked: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    for (const storage of [undefined, blocked]) {
      const unsubscribe = attachResumeLifecycle(storage, () => draft(), () => NOW);
      expect(() => windowEvents.dispatchEvent(new Event('pagehide'))).not.toThrow();
      expect(hide).not.toThrow();
      unsubscribe();
    }
    expect(blocked.setItem).not.toHaveBeenCalled();
    expect(blocked.removeItem).not.toHaveBeenCalled();
  });

  it('ignores a missing or throwing draft during page exit without crashing', () => {
    const windowEvents = new EventTarget();
    const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
    vi.stubGlobal('window', windowEvents);
    vi.stubGlobal('document', documentEvents);
    const storage = memory();
    const unsubscribe = attachResumeLifecycle(storage, () => { throw new Error('unmounting'); }, () => NOW);
    expect(() => windowEvents.dispatchEvent(new Event('pagehide'))).not.toThrow();
    expect(storage.values.size).toBe(0);
    unsubscribe();
  });
});

describe('accessible resume surfaces', () => {
  it('produces a safe, readable location label and question position', () => {
    const storage = memory();
    saveResume(storage, draft(), NOW);
    const value = readResume(storage, NOW)!;
    expect(resumeName(value)).toBe('module 1 · cards');
    expect(resumePosition(value)).toBe('question 4 of 20');
  });

  it('the home strip links directly to the saved page with accessible progress', () => {
    const storage = memory();
    saveResume(storage, draft(), NOW);
    const html = renderToStaticMarkup(createElement(ContinueStrip, { snapshot: readResume(storage, NOW)! }));
    expect(html).toContain('href="/learn/study-skills/cards"');
    expect(html).toContain('aria-label="continue studying"');
    expect(html).toContain('4/20');
    expect(html).toContain('max="20"');
    expect(html).toContain('aria-label="saved study progress"');
    expect(html).not.toContain('https://');
  });

  it('the study prompt shows two keyboard-usable decisions and no answer data', () => {
    const storage = memory();
    saveResume(storage, draft(), NOW);
    const html = renderToStaticMarkup(createElement(ResumeChoices, {
      snapshot: readResume(storage, NOW)!,
      problem: '',
      onContinue: () => {},
      onStartOver: () => {},
    }));
    expect(html).toContain('pick up where you left off?');
    expect(html).toContain('continue question 4');
    expect(html).toContain('start over');
    expect(html).toContain('<button');
    expect(html).toContain('aria-labelledby="cueory-resume-heading"');
    expect(html).not.toContain('right-answer');
  });
});
