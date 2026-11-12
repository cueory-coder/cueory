import { readdirSync, readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The baseline is explicit, not a wildcard. These are focused feature/edge-case suites,
// with page-level axe already covered by a11y-sweep.spec.ts or a named companion spec.
// Remove a line when the owner adds axe to that spec. New files require axe by default.
const knownWithoutAxe: Readonly<Record<string, string>> = {
  "404-page.spec.ts": "Recovery-link and 404-layout regression; 404.spec.ts and a11y-sweep.spec.ts run axe on the missing-page UI.",
  "about.spec.ts": "Founder-copy placeholder structure; the built about route is covered by the site-wide axe sweep.",
  "account-corner-keyboard.spec.ts": "Targeted menu keyboard/focus sequence; account.spec.ts and the site-wide sweep provide axe.",
  "account-launch.spec.ts": "Launch-mode switch and account-menu presence; site-wide axe audits the rendered home route.",
  "anatomy-export-switch.spec.ts": "Synthetic PNG export race; anatomy-lab.spec.ts runs axe on the accessible lab UI.",
  "anatomy-list-window.spec.ts": "Large catalog windowing and keyboard focus; anatomy-lab.spec.ts owns full UI axe.",
  "anatomy-no-javascript.spec.ts": "JavaScript deliberately disabled, which prevents injecting axe; the enabled lab is audited separately.",
  "anatomy-picture-credit.spec.ts": "PNG export attribution and dimensions rather than a DOM page audit; anatomy-lab.spec.ts has axe.",
  "anatomy-picture-font-timeout.spec.ts": "Intentionally stalled font requests stress PNG export timeout; anatomy-lab.spec.ts handles axe.",
  "anatomy-stale-initial-error.spec.ts": "Simulated outdated model-load failure race; anatomy-lab.spec.ts runs the visual accessibility audit.",
  "anatomy-touch-css.spec.ts": "Strict-CSP touch-action behavior, not page-wide accessibility; anatomy-lab.spec.ts runs axe.",
  "anchor-scroll.spec.ts": "Anchor scroll offsets and overlap; a11y-sweep.spec.ts runs axe on the same built pages.",
  "auth-callback-page.spec.ts": "Failure callback recovery and safe URL cleanup; a11y-sweep.spec.ts checks the rendered callback route.",
  "body-line-height.spec.ts": "Cross-route computed Lato line spacing; a11y-sweep.spec.ts covers full markup.",
  "body-viewer.spec.ts": "Lazy 3D model asset loading and controls; page-wide axe is covered by the built-page sweep.",
  "coming-soon.spec.ts": "Planned course listing and navigation targets; the global axe sweep covers the page.",
  "courses.spec.ts": "Course listing and navigation regression; the global axe sweep covers the page.",
  "csp-sweep.spec.ts": "Security-only CSP test deliberately produces a violation in a fixture; a11y-sweep.spec.ts audits pages.",
  "exam-plan-sync.spec.ts": "Mocked account-plan timing, race and RPC states; start.spec.ts and progress.spec.ts run axe.",
  "fill-in-announcements.spec.ts": "Narrow live-region feedback assertion; fill-in-dropdown.spec.ts runs axe on the fill-in UI.",
  "forced-colors.spec.ts": "OS forced-color contrast/focus checks; a11y-sweep.spec.ts audits normal page markup.",
  "header-tuck.spec.ts": "Sticky-header pointer and focus restoration behavior; full-page axe is covered by the sweep.",
  "history-navigation.spec.ts": "Back/Forward restoration and persisted state, not a page markup audit; global axe covers routes.",
  "home-page.spec.ts": "Approved home layout/link behavior; home-modern.spec.ts runs axe for the same surface.",
  "indexing.spec.ts": "Robots and sitemap metadata assertions; built pages are separately scanned by a11y-sweep.spec.ts.",
  "label-it-page.spec.ts": "Focused label-it behavior and announcements; resume-label-it.spec.ts runs axe.",
  "large-text-reflow.spec.ts": "Cross-route 32px root-font overflow probe; global axe covers the original pages.",
  "lesson-video.spec.ts": "Consent-gated embedded video network behavior; the inactive lesson UI is audited in the global sweep.",
  "lesson-visuals.spec.ts": "Draft visual absence and license gating; the lesson page is covered by global axe.",
  "navigation-links.spec.ts": "Menu/footer link destination audit; their rendered surfaces are covered by global axe.",
  "no-javascript-routes.spec.ts": "JavaScript disabled to check no-script fallbacks, preventing axe injection; normal pages have global axe.",
  "offline.spec.ts": "Service-worker caching and simulated offline failures; global axe runs online in a separate suite.",
  "phone-overflow.spec.ts": "320px/390px geometric overflow sweep; a11y-sweep.spec.ts runs axe at supported sizes.",
  "print-lessons.spec.ts": "Print-media layout and no-JavaScript fallback, not an interactive page-state axe audit.",
  "privacy-page.spec.ts": "Legal copy and destination assertions; the privacy route is in the global axe sweep.",
  "reduced-motion.spec.ts": "Animation suppression in motion-reduced mode; the global axe sweep covers the page DOM.",
  "reflow-640.spec.ts": "640px clipping and reflow checks; global axe inspects semantic markup separately.",
  "result-brand-mark.spec.ts": "Game result artwork timing/placement; play.spec.ts runs axe on the game UI.",
  "sticky-header-overlap.spec.ts": "Cross-route heading and focused-control geometry; global axe audits the corresponding pages.",
  "storage-blocked-pages.spec.ts": "Deliberately disabled browser storage to expose crashes; normal pages have global axe.",
  "study-events.spec.ts": "Isolated RPC telemetry fixture and privacy checks; questions-page.spec.ts runs axe on the question UI.",
  "tap-targets.spec.ts": "Cross-route 44px touch-target geometry test; full-page axe runs in the global sweep.",
  "theme-navigation.spec.ts": "Theme persistence across history and reload; dark-mode.spec.ts runs axe on palette states.",
  "visible-focus.spec.ts": "Focused keyboard-indicator geometry sweep; global axe handles full semantic checks.",
  "console-clean.spec.ts": "W15-2 issue #58 is a deliberate error/network/CSP detector, including failure fixtures; a11y-sweep.spec.ts runs axe.",
};

type SpecSource = { name: string; source: string };

const e2eDir = fileURLToPath(new URL('../e2e/', import.meta.url));

/**
 * Parse the spec's source text, rather than matching comments or quoted examples.
 * Page fixtures are included even when navigation happens inside an imported helper.
 * Also recognizes popup.goto(), context.newPage(), and bracket-call equivalents.
 */
function needsAxe(source: string): boolean {
  const ast = ts.createSourceFile('browser-spec.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let usesPage = false;
  let createsAxe = false;

  const visit = (node: ts.Node): void => {
    if (ts.isParameter(node) && ts.isObjectBindingPattern(node.name)) {
      usesPage ||= node.name.elements.some((part) => {
        const name = part.propertyName ?? part.name;
        return ts.isIdentifier(name) && name.text === 'page';
      });
    }
    if (ts.isCallExpression(node)) {
      const call = node.expression;
      const operation = ts.isPropertyAccessExpression(call) ? call.name.text :
        ts.isElementAccessExpression(call) && ts.isStringLiteral(call.argumentExpression)
          ? call.argumentExpression.text : '';
      if (operation === 'goto' || operation === 'newPage') usesPage = true;
    }
    if (ts.isNewExpression(node)) {
      const name = ts.isIdentifier(node.expression) ? node.expression.text :
        ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      if (name === 'AxeBuilder') createsAxe = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return usesPage && !createsAxe;
}

function assertCoverage(specs: readonly SpecSource[], exceptions: Readonly<Record<string, string>>): void {
  const uncovered = specs.filter(({ name, source }) =>
    needsAxe(source) && !Object.prototype.hasOwnProperty.call(exceptions, name));
  if (uncovered.length) {
    throw new Error('Browser navigation without axe or an explained exception: ' +
      uncovered.map(({ name }) => name).sort().join(', '));
  }
}

function currentSpecs(): SpecSource[] {
  return readdirSync(e2eDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => ({ name: entry.name, source: readFileSync(join(e2eDir, entry.name), 'utf8') }));
}

describe('page-navigation browser specs must run axe', () => {
  it('detects a new navigation spec with no accessibility scan', () => {
    const sample = [{ name: 'new-screen.spec.ts', source: "await page.goto('/sample');" }];
    expect(() => assertCoverage(sample, {})).toThrow(/new-screen\.spec\.ts/);
    // An import on its own must not satisfy the requirement.
    expect(() => assertCoverage([
      { name: 'new-screen.spec.ts', source: "import AxeBuilder from '@axe-core/playwright'; await page.goto('/sample');" },
    ], {})).toThrow(/new-screen\.spec\.ts/);
  });

  it('detects popup navigation and page fixtures passed through helpers', () => {
    expect(() => assertCoverage([
      { name: 'popup.spec.ts', source: "await popup.goto('/sample');" },
      { name: 'indirect.spec.ts', source: "test('page', async ({ page }) => { await openPage(page); });" },
      { name: 'new-tab.spec.ts', source: "const tab = await context.newPage(); await openPage(tab);" },
    ], {})).toThrow(/indirect\.spec\.ts.*new-tab\.spec\.ts.*popup\.spec\.ts/);
  });

  it('does not treat comments, imports or string literals as a running axe scan', () => {
    expect(() => assertCoverage([
      { name: 'comment.spec.ts', source: "// new AxeBuilder({ page });\nawait page.goto('/sample');" },
      { name: 'string.spec.ts', source: "const example = 'new AxeBuilder({ page })'; await page.goto('/sample');" },
    ], {})).toThrow(/comment\.spec\.ts.*string\.spec\.ts/);
    expect(() => assertCoverage([
      { name: 'example-only.spec.ts', source: "// await page.goto('/sample');\nconst example = 'popup.goto(/sample)';" },
    ], {})).not.toThrow();
  });

  it('accepts an executed axe builder and ignores non-navigation tests', () => {
    expect(() => assertCoverage([
      { name: 'with-axe.spec.ts', source: "await page.goto('/sample'); await new AxeBuilder({ page }).analyze();" },
      { name: 'pure.spec.ts', source: "expect(add(2, 3)).toBe(5);" },
    ], {})).not.toThrow();
  });

  it('documents only the existing, individually justified exceptions', () => {
    for (const [name, reason] of Object.entries(knownWithoutAxe)) {
      expect(name.endsWith('.spec.ts'), name).toBe(true);
      expect(reason.trim().length, name + ': exception needs a specific reason').toBeGreaterThan(30);
    }
    // W15-2 has its own ready MR. Its route/error suite may not be on staging yet.
    const specs = currentSpecs();
    const byName = new Map(specs.map(({ name, source }) => [name, source]));
    const stale = Object.keys(knownWithoutAxe).filter((name) =>
      byName.has(name) && !needsAxe(byName.get(name)!));
    expect(stale, 'Remove an exception when its spec starts running axe or stops navigating').toEqual([]);
    expect(() => assertCoverage(specs, knownWithoutAxe)).not.toThrow();
  });
});
