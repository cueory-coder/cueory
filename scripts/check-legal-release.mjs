/**
 * Fail closed before an automatic Workers production build can publish draft legal pages.
 *
 * Workers Builds injects WORKERS_CI=1 and WORKERS_CI_BRANCH=<branch>.
 * PR/main CI also uses this check. Staging previews and local development remain usable.
 * This is a placeholder check, not a substitute for founder/legal approval.
 */
import { readFileSync } from 'node:fs';

function isProductionRelease(env) {
  return env.CUEORY_LEGAL_RELEASE_AUDIT === '1'
    || (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'main')
    || (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main')
    || (env.WORKERS_CI === '1' && env.WORKERS_CI_BRANCH === 'main');
}

if (isProductionRelease(process.env)) {
  const pages = [
    ['terms', '../src/pages/terms.astro', /<PlaceholderBlock\b|Christian:\s*paste your terms of use here/i],
    ['disclaimer', '../src/pages/disclaimer.astro', /<PlaceholderBlock\b|Christian:\s*paste your disclaimer here/i],
    ['privacy', '../src/pages/privacy.astro', /Draft for review|Last updated:\s*not yet published/i],
  ];
  let blocked = false;
  for (const [label, path, marker] of pages) {
    // A missing source file also fails the build rather than silently skipping a gate.
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    if (marker.test(source)) {
      console.error('legal release blocked: ' + label + ' still contains placeholder or draft copy.');
      blocked = true;
    }
  }
  if (blocked) process.exitCode = 1;
}
