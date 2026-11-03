import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import SurveyPrompt from '../../src/islands/SurveyPrompt';

describe('SurveyPrompt unit tests', () => {
  const testKey = 'cueory-test-survey-dismissed';

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // storage unavailable
    }
  });

  it('renders both survey questions and controls when not active and not dismissed', () => {
    const markup = renderToStaticMarkup(createElement(SurveyPrompt, { storageKey: testKey }));
    expect(markup).toContain('quick semester survey');
    expect(markup).toContain('did you use Cueory for a final or exit exam this semester?');
    expect(markup).toContain('what would make it more useful?');
    expect(markup).toContain('send feedback');
    expect(markup).toContain('not now');
  });

  it('never renders while a question or card is active (activeQuestion=true)', () => {
    const markup = renderToStaticMarkup(
      createElement(SurveyPrompt, { activeQuestion: true, storageKey: testKey }),
    );
    expect(markup).toBe('');
  });

  it('renders nothing when already marked dismissed', () => {
    try {
      localStorage.setItem(testKey, 'true');
    } catch {
      // ignore
    }
    const markup = renderToStaticMarkup(createElement(SurveyPrompt, { storageKey: testKey }));
    expect(markup).toBe('');
  });
});
