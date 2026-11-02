/** Pure, keyboard-safe scroll decision for Cueory's reading header. No DOM or clock access. */

export const HEADER_HIDE_AFTER_PX = 80;
export type HeaderState = 'visible' | 'hidden';

/**
 * Scroll down beyond 80px to tuck the header, scroll up to show it again.
 * Focus and an open menu always take priority; a stationary scroll preserves the previous state.
 */
export function nextHeaderState(
  previous: HeaderState,
  scrollY: number,
  lastY: number,
  focusInside: boolean,
  menuOpen: boolean,
): HeaderState {
  if (focusInside || menuOpen) return 'visible';
  // Invalid positions and the top of the page are never a reason to hide navigation.
  if (!Number.isFinite(scrollY) || !Number.isFinite(lastY) || lastY < 0 || scrollY <= HEADER_HIDE_AFTER_PX) {
    return 'visible';
  }
  if (scrollY > lastY) return 'hidden';
  if (scrollY < lastY) return 'visible';
  return previous;
}
