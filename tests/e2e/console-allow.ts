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
  { route: CONSOLE_MISSING_ROUTE, kind: 'console', resourcePath: CONSOLE_MISSING_ROUTE, diagnostic: /(?:404|not found)/i, owner: 'W15', reason: 'Some engines log the expected missing-document response to the console.' },
];

export function allowedConsoleFinding(route: string, finding: ConsoleFinding): boolean {
  let resourcePath: string;
  try {
    resourcePath = new URL(finding.url).pathname;
  } catch {
    return false;
  }
  return consoleAllowances.some((allowance) =>
    allowance.route === route &&
    allowance.kind === finding.kind &&
    allowance.resourcePath === resourcePath &&
    allowance.diagnostic.test(finding.message));
}
