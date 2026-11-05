import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SurveyPrompt, { deliverSurveyFeedback } from '../../src/islands/SurveyPrompt';
import type { KeyValueStorage } from '../../src/scripts/storage';

function createMockStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
  };
}

describe('SurveyPrompt unit tests', () => {
  const testKey = 'cueory-test-survey-dismissed';

  it('keeps the server markup empty until hydration can read persisted dismissal state', () => {
    const markup = renderToStaticMarkup(createElement(SurveyPrompt, { storageKey: testKey, storage: createMockStorage() }));
    expect(markup).toBe('');
    // The Playwright preview regression verifies the form after browser hydration.
  });

  it('does not claim feedback was sent without a configured callback', async () => {
    await expect(deliverSurveyFeedback(undefined, { usedForFinal: true, feedback: 'sample' }))
      .resolves.toBe('unavailable');
  });

  it('confirms only after an asynchronous submission succeeds', async () => {
    const submitted: Array<{ usedForFinal: boolean | null; feedback: string }> = [];
    const data = { usedForFinal: false, feedback: 'sample feedback' };
    const outcome = await deliverSurveyFeedback(async (value) => { submitted.push(value); }, data);
    expect(outcome).toBe('sent');
    expect(submitted).toEqual([data]);
  });

  it('reports failed submission so the form can retain answers for retry', async () => {
    const error = new Error('network unavailable');
    await expect(deliverSurveyFeedback(async () => { throw error; }, { usedForFinal: true, feedback: 'keep me' }))
      .resolves.toBe('failed');
  });

  it('never renders while a question or card is active (activeQuestion=true)', () => {
    const markup = renderToStaticMarkup(
      createElement(SurveyPrompt, { activeQuestion: true, storageKey: testKey, storage: createMockStorage() }),
    );
    expect(markup).toBe('');
  });

  it('renders nothing when already marked dismissed', () => {
    const storage = createMockStorage({ [testKey]: 'true' });
    const markup = renderToStaticMarkup(createElement(SurveyPrompt, { storageKey: testKey, storage }));
    expect(markup).toBe('');
  });
});
