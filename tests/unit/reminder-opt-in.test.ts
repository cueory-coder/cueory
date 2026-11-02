import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReminderOptIn from '../../src/islands/ReminderOptIn';

describe('review reminder offer boundary', () => {
  it('does not offer reminders when a completed review was not supplied', () => {
    expect(renderToStaticMarkup(createElement(ReminderOptIn))).toBe('');
  });

  it.each([false, null, 0, 1, 'true', {}])('does not accept a truthy substitute for completion %#', reviewCompleted => {
    expect(renderToStaticMarkup(createElement(ReminderOptIn, { reviewCompleted: reviewCompleted as boolean }))).toBe('');
  });

  it('starts collapsed and describes the non-sending preview after completion', () => {
    const html = renderToStaticMarkup(createElement(ReminderOptIn, { reviewCompleted: true }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('remind me');
    expect(html).toContain('nothing will be sent, enabled or saved.');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('<form');
  });
});
