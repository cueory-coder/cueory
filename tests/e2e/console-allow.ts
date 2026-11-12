/**
 * Narrow exceptions for the all-route console sweep.
 *
 * An allowance must name the route, signal, resource and exact expected diagnostic,
 * with an owner and a reason. Do not add broad origin or message suppressions.
 */
export const CONSOLE_MISSING_ROUTE = '/console-clean-deliberate-404';

export type ConsoleFinding = {
  kind: 'console' | 'pageerror' | 'requestfailed' | 'http' | 'csp';
  url: string;
  message: string;
};

type Allowance = {
  route: string;
  kind: ConsoleFinding['kind'];
  resourcePath: string;
  diagnostic: RegExp;
  owner: string;
  reason: string;
};

export const consoleAllowances: readonly Allowance[] = [
  { route: CONSOLE_MISSING_ROUTE, kind: 'http', resourcePath: CONSOLE_MISSING_ROUTE, diagnostic: /^HTTP 404 GET$/, owner: 'W15', reason: 'The intentionally absent document exercises the real 404 response.' },
  { route: CONSOLE_MISSING_ROUTE, kind: 'console', resourcePath: CONSOLE_MISSING_ROUTE, diagnostic: /^Failed to load resource: the server responded with a status of 404(?:\s*\([^)]*\))?\.?$/i, owner: 'W15', reason: 'Some engines report the expected missing-document HTTP 404 as a resource-load console error.' },
];

export function allowedConsoleFinding(route: string, finding: ConsoleFinding, origin: string): boolean {
  let resource: URL;
  try {
    resource = new URL(finding.url);
  } catch {
    // No location means no exception. Never attribute an unknown-origin console
    // failure to the current page just because that page is the expected 404.
    return false;
  }
  if (resource.origin !== origin || resource.search || resource.hash) return false;
  return consoleAllowances.some((allowance) =>
    allowance.route === route &&
    allowance.kind === finding.kind &&
    allowance.resourcePath === resource.pathname &&
    allowance.diagnostic.test(finding.message));
}
