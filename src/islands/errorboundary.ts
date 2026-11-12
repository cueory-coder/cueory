/**
 * Plain-language error fallback. Never copy exception messages into the page.
 * Keep error details private in production; even local debugging requires opt-in.
 */
export const ERROR_BOUNDARY_COPY = {
  title: "this part didn't load.",
  description: 'reload the page to try again. the rest of the page is still available.',
  reloadLabel: 'reload page',
} as const;

export function shouldShowErrorDetails(isProduction: boolean, debugOptIn: boolean): boolean {
  return !isProduction && debugOptIn;
}

export function errorBoundaryView(isProduction: boolean, debugOptIn = false) {
  return { ...ERROR_BOUNDARY_COPY, showDetails: shouldShowErrorDetails(isProduction, debugOptIn) };
}
