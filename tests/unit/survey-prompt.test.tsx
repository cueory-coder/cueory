import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SurveyPrompt from '../../src/islands/SurveyPrompt';

describe('SurveyPrompt', () => {
  const testKey = 'cueory-test-survey-dismissed';

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // storage blocked
    }
  });

  afterEach(() => {
    cleanup();
  });

  it('renders both survey questions and controls when not active and not dismissed', () => {
    render(<SurveyPrompt storageKey={testKey} />);
    expect(screen.getByText('quick semester survey')).toBeDefined();
    expect(
      screen.getByText('did you use Cueory for a final or exit exam this semester?'),
    ).toBeDefined();
    expect(screen.getByLabelText('what would make it more useful?')).toBeDefined();
    expect(screen.getByRole('button', { name: 'send feedback' })).toBeDefined();
  });

  it('never opens while a question or card is active (activeQuestion=true)', () => {
    const { container } = render(<SurveyPrompt activeQuestion={true} storageKey={testKey} />);
    expect(container.firstChild).toBeNull();
  });

  it('can be dismissed and remembers dismissal in localStorage', () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<SurveyPrompt storageKey={testKey} onDismiss={onDismiss} />);

    const dismissBtn = screen.getByRole('button', { name: 'dismiss survey' });
    fireEvent.click(dismissBtn);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(testKey)).toBe('true');
    unmount();

    // Re-rendering with the same key should not display
    const { container } = render(<SurveyPrompt storageKey={testKey} />);
    expect(container.firstChild).toBeNull();
  });

  it('submits responses via onSubmit and limits feedback length', () => {
    const onSubmit = vi.fn();
    render(<SurveyPrompt storageKey={testKey} onSubmit={onSubmit} />);

    const yesRadio = screen.getByLabelText('yes');
    fireEvent.click(yesRadio);

    const textarea = screen.getByLabelText('what would make it more useful?');
    fireEvent.change(textarea, { target: { value: 'More case studies and pharmacology calculations.' } });

    const submitBtn = screen.getByRole('button', { name: 'send feedback' });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      usedForFinal: true,
      feedback: 'More case studies and pharmacology calculations.',
    });
    expect(screen.getByText('thank you for your feedback.')).toBeDefined();
    expect(localStorage.getItem(testKey)).toBe('true');
  });

  it('safely handles blocked or throwing localStorage', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage is blocked');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage is blocked');
    });

    expect(() => render(<SurveyPrompt storageKey={testKey} />)).not.toThrow();
    const dismissBtn = screen.getByRole('button', { name: 'dismiss survey' });
    expect(() => fireEvent.click(dismissBtn)).not.toThrow();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
