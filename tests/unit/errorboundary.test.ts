import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ErrorBoundary, { ErrorBoundaryDemo, ErrorBoundaryFallback } from '../../src/islands/ErrorBoundary';
import { ERROR_BOUNDARY_COPY, errorBoundaryView, shouldShowErrorDetails } from '../../src/islands/errorboundary';

// Assertions inspect serialized HTML, where React escapes punctuation in text and attributes.
const titleHTML = renderToString(ERROR_BOUNDARY_COPY.title);
function expectFallbackTitle(html: string) {
  expect(html).toContain(`aria-label="${titleHTML}"`);
  expect(html).toContain(`>${titleHTML}</h3>`);
}

describe('error boundary text and privacy policy', () => {
  it('uses plain words and never reveals details in production', () => {
    expect(errorBoundaryView(true, true)).toEqual({ ...ERROR_BOUNDARY_COPY, showDetails: false });
    expect(shouldShowErrorDetails(true, true)).toBe(false);
    expect(errorBoundaryView(false).showDetails).toBe(false);
    expect(shouldShowErrorDetails(false, true)).toBe(true);
  });

  it('renders a safe button instead of throwing on a normal preview load', () => {
    const html = renderToString(createElement(ErrorBoundaryDemo));
    expect(html).toContain('data-error-boundary-demo');
    expect(html).toContain('data-error-demo-trigger');
    expect(html).toContain('show sample error');
    expect(html).toContain('type="button"');
    expect(html).toContain('min-h-11');
    expect(html).not.toContain('data-error-fallback');
    expect(html).not.toContain('[sample simulated render failure]');
  });

  it('renders an accessible fallback and a real reload button without raw errors', () => {
    const privateText = '[sample simulated render failure]';
    const html = renderToString(createElement(ErrorBoundaryFallback));
    expect(html).toContain('data-error-fallback');
    expect(html).toContain('role="status"');
    expect(html).toContain('type="button"');
    expect(html).toContain('min-h-11');
    expectFallbackTitle(html);
    expect(html).toContain(ERROR_BOUNDARY_COPY.reloadLabel);
    expect(html).not.toContain(privateText);
    expect(html).not.toContain('development preview');
  });

  it('never exposes thrown strings, objects, or exception stacks in its fallback HTML', () => {
    const content = createElement('span', null, '[sample working part]');
    for (const secret of ['[sample private error payload]', "[sample private error: can't show <secret> & details]"]) {
      for (const thrown of [secret, new Error(secret), { details: secret }, null]) {
        expect(ErrorBoundary.getDerivedStateFromError(thrown)).toEqual({ hasError: true });
        const boundary = new ErrorBoundary({ children: content });
        boundary.state = { hasError: true };
        const html = renderToString(boundary.render());
        expectFallbackTitle(html);
        expect(html).not.toContain(secret);
        expect(html).not.toContain(renderToString(secret));
        expect(html).not.toContain('[sample working part]');
      }
    }
  });

  it('keeps healthy children visible and switches to fallback after an error', () => {
    const content = createElement('span', null, '[sample working part]');
    const html = renderToString(createElement(ErrorBoundary, null, content));
    expect(html).toContain('[sample working part]');
    expect(html).not.toContain(titleHTML);
    expect(ErrorBoundary.getDerivedStateFromError(new Error('[sample secret]'))).toEqual({ hasError: true });
    const boundary = new ErrorBoundary({ children: content });
    boundary.state = { hasError: true };
    const fallbackHtml = renderToString(boundary.render());
    expectFallbackTitle(fallbackHtml);
    expect(fallbackHtml).not.toContain('[sample secret]');
  });
});
