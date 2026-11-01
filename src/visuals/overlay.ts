/** Pure state logic for the disease-overlay frame (D-56). No React, no DOM — unit-testable directly. */

export type OverlayView = 'healthy' | 'changed';

export interface OverlayState {
  view: OverlayView;
}

/** Returns the initial state: always start on the healthy view. */
export function initialState(): OverlayState {
  return { view: 'healthy' };
}

/** Returns a new state with the given view selected. */
export function selectView(view: OverlayView): OverlayState {
  return { view };
}

/** Returns a new state with the opposite view selected. */
export function toggleView(state: OverlayState): OverlayState {
  return { view: state.view === 'healthy' ? 'changed' : 'healthy' };
}

/** The text announced by the polite live region for the current view. */
export function liveText(state: OverlayState, changedName: string): string {
  return state.view === 'healthy' ? 'Showing healthy' : `Showing ${changedName}`;
}
