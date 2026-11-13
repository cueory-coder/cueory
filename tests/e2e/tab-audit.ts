import type { Page } from '@playwright/test';

export async function tabAudit(page: Page, checkSkipTarget = false): Promise<string[]> {
  const problems: string[] = [];
  const selector = 'a[href], button, input, select, textarea, [tabindex], details > summary:first-of-type';

  // Save each element's UNFOCUSED appearance. A permanent outline must not
  // count as a keyboard focus indicator if it looks identical when focused.
  const eligible = await page.evaluate((query) => {
    const controls = [...document.querySelectorAll<HTMLElement>(query)];
    const isReachable = (el: HTMLElement) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled') &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility === 'visible';

    return controls.flatMap((el, index) => {
      if (!isReachable(el)) return [];
      // A native radio group is one Tab stop, even with several radio inputs.
      if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
        const group = controls.filter(
          (peer): peer is HTMLInputElement =>
            peer instanceof HTMLInputElement &&
            peer.type === 'radio' &&
            peer.name === el.name &&
            peer.form === el.form &&
            isReachable(peer),
        );
        if (el !== (group.find((peer) => peer.checked) ?? group[0])) return [];
      }
      const style = getComputedStyle(el);
      return [{
        index,
        label: el.id ? '#' + el.id : el.getAttribute('aria-label') ?? el.tagName.toLowerCase() + '[' + index + ']',
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        boxShadow: style.boxShadow,
      }];
    });
  }, selector);

  const seen = new Set<number>();
  // Long game pages need more than a small fixed number of Tab presses.
  // Roving-tabindex widgets count only their active (tabIndex >= 0) cell.
  const maxTabs = Math.max(24, eligible.length * 3 + 20);
  let firstIndex: number | null = null;
  let lastIndex: number | null = null;
  let lastVisibleFocus = false;
  let sameElementTabs = 0;
  let finished = false;

  for (let step = 0; step < maxTabs; step++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(({ query, baselines }) => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;

      const candidates = [...document.querySelectorAll<HTMLElement>(query)];
      const index = candidates.indexOf(el);
      const previous = baselines.find((control) => control.index === index);
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // rgb(0, 0, 0) is opaque black, NOT alpha zero. Only rgba has
      // a comma-separated alpha component in this browser.
      const color = style.outlineColor;
      const transparent = color === 'transparent' ||
        (color.startsWith('rgba(') && Number.parseFloat(color.slice(color.lastIndexOf(',') + 1)) === 0);
      const outlineIsVisible = style.outlineStyle !== 'none' &&
        Number.parseFloat(style.outlineWidth) > 0 && !transparent;
      const outlineChanged = !previous ||
        style.outlineStyle !== previous.outlineStyle ||
        style.outlineWidth !== previous.outlineWidth ||
        style.outlineColor !== previous.outlineColor ||
        style.outlineOffset !== previous.outlineOffset;
      const shadowChanged = style.boxShadow !== 'none' && style.boxShadow !== previous?.boxShadow;

      return {
        index,
        name: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
          (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : ''),
        skipTarget: el.matches('a[href="#main"]') ? { width: rect.width, height: rect.height } : null,
        inputType: el instanceof HTMLInputElement ? el.type : null,
        visibleFocus: el.matches(':focus-visible') && ((outlineIsVisible && outlineChanged) || shadowChanged),
        inViewport: rect.width > 0 && rect.height > 0 &&
          rect.top < innerHeight && rect.bottom > 0 &&
          rect.left < innerWidth && rect.right > 0,
      };
    }, { query: selector, baselines: eligible });

    // Chrome may move focus into the browser chrome at the end, or wrap it to
    // the first stop. Neither counts as success until all eligible controls
    // were visited.
    if (!focused) {
      finished = true;
      break;
    }
    if (firstIndex !== null && focused.index === firstIndex && seen.size > 1 &&
        eligible.every((control) => seen.has(control.index))) {
      finished = true;
      break;
    }
    if (firstIndex === null) firstIndex = focused.index;

    sameElementTabs = focused.index === lastIndex ? sameElementTabs + 1 : 0;
    // Date/time inputs have multiple native subfields: on the final segment
    // Chromium may not match :focus-visible on the host while the selected
    // subfield itself still has native focus. Preserve a demonstrated earlier
    // indicator for this SAME input; never excuse a missing first indicator.
    const nativeSegment = focused.index === lastIndex &&
      ['date', 'time', 'datetime-local', 'month', 'week'].includes(focused.inputType ?? '');
    const hasIndicator: boolean = focused.visibleFocus || (nativeSegment && lastVisibleFocus);
    lastIndex = focused.index;
    lastVisibleFocus = hasIndicator;

    if (sameElementTabs > 8) {
      problems.push(focused.name + ': keyboard focus did not advance after repeated Tab presses');
      break;
    }

    seen.add(focused.index);
    if (focused.index === -1) problems.push(focused.name + ': focus target not in the page tab-order elements');
    if (checkSkipTarget && focused.skipTarget && (focused.skipTarget.width < 44 || focused.skipTarget.height < 44)) {
      problems.push('focused skip link: target ' + focused.skipTarget.width.toFixed(1) + '×' + focused.skipTarget.height.toFixed(1) + 'px');
    }
    if (!hasIndicator) problems.push(focused.name + ': keyboard focus has no visible outline');
    if (!focused.inViewport) problems.push(focused.name + ': focus is outside the visible viewport');
  }

  if (!seen.size) problems.push('Tab did not reach an interactive element');
  const missing = eligible.filter((control) => !seen.has(control.index));
  if (missing.length) {
    problems.push('Tab did not reach ' + missing.length + ' eligible controls: ' +
      missing.map((control) => control.label).join(', '));
  }
  if (!finished) problems.push('Tab traversal did not finish within ' + maxTabs + ' presses');
  return problems;
}

