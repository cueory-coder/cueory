import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SurveyPrompt from '../../src/islands/SurveyPrompt';
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

  it('renders both survey questions and controls when not active and not dismissed', () => {
    const markup = renderToStaticMarkup(createElement(SurveyPrompt, { storageKey: testKey, storage: createMockStorage() }));
    expect(markup).toContain('quick semester survey');
    expect(markup).toContain('did you use Cueory for a final or exit exam this semester?');
    expect(markup).toContain('what would make it more useful?');
    expect(markup).toContain('send feedback');
    expect(markup).toContain('not now');
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
