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
  "search-retry.spec.ts": "Search module-download failure and retry fixture; the menu and missing-page UI receive separate axe coverage in the site-wide and 404 suites.",
  "resume-cleared-progress.spec.ts": "Cross-tab progress deletion and stale-save lifecycle test; progress, fill-in and matching/organizer suites run axe on those interfaces.",
  "sticky-header-overlap.spec.ts": "Cross-route heading and focused-control geometry; global axe audits the corresponding pages.",
  "storage-blocked-pages.spec.ts": "Deliberately disabled browser storage to expose crashes; normal pages have global axe.",
  "sudoku-highlight.spec.ts": "Focused selected-cell, related-row/column/box color and contrast geometry, with semantic Sudoku and keyboard accessibility covered by sudoku-keyboard-a11y.spec.ts.",
  "tap-targets.spec.ts": "Cross-route 44px touch-target geometry test; full-page axe runs in the global sweep.",
  "theme-navigation.spec.ts": "Theme persistence across history and reload; dark-mode.spec.ts runs axe on palette states.",
  "visible-focus.spec.ts": "Focused keyboard-indicator geometry sweep; global axe handles full semantic checks.",
  "study-events.spec.ts": "Isolated RPC telemetry fixture and privacy checks; questions-page.spec.ts runs axe on the question UI.",
  "console-clean.spec.ts": "W15-2 issue #58 is a deliberate error/network/CSP detector, including failure fixtures; a11y-sweep.spec.ts runs axe.",
};

type SpecSource = { name: string; source: string };

const e2eDir = fileURLToPath(new URL('../e2e/', import.meta.url));

/**
 * Inspect executable AST nodes, not comments or fixture strings. A test using
 * the page fixture and delegating to a helper is treated as a page-level spec:
 * the helper may navigate even when this file contains no visible goto().
 */
function needsAxe(source: string): boolean {
  const parsed = ts.createSourceFile('browser-spec.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const methodName = (callee: ts.LeftHandSideExpression): string | undefined => {
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    if (ts.isElementAccessExpression(callee) && callee.argumentExpression &&
      (ts.isStringLiteral(callee.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(callee.argumentExpression))) {
      return callee.argumentExpression.text;
    }
    return undefined;
  };
  const isAxeConstructor = (node: ts.Node): boolean =>
    ts.isNewExpression(node) && (
      ts.isIdentifier(node.expression) && node.expression.text === 'AxeBuilder' ||
      ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'AxeBuilder'
    );

  type Binding = ts.VariableDeclaration | ts.FunctionDeclaration | ts.ParameterDeclaration;
  // Resolve each use through its own lexical scope. A variable in an unused
  // helper or a different test cannot make a shadowed analyzer an axe scan.
  const visibleBinding = (use: ts.Identifier): Binding | undefined => {
    for (let scope: ts.Node | undefined = use.parent; scope; scope = scope.parent) {
      if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
        for (const statement of scope.statements) {
          if (ts.isVariableStatement(statement)) {
            for (const decl of statement.declarationList.declarations) {
              if (ts.isIdentifier(decl.name) && decl.name.text === use.text) return decl;
            }
          }
          if (ts.isFunctionDeclaration(statement) && statement.name?.text === use.text) return statement;
        }
      }
      if (ts.isFunctionLike(scope)) {
        for (const param of scope.parameters) {
          if (ts.isIdentifier(param.name) && param.name.text === use.text) return param;
        }
      }
    }
    return undefined;
  };
  const builderMethods = new Set(['withTags', 'withRules', 'disableRules', 'include', 'exclude', 'options']);
  // A factory is axe-backed only if its actual returned value is axe-backed,
  // not merely because its body creates an unused AxeBuilder.
  const returnsAxe = (body: ts.ConciseBody, seen: ReadonlySet<ts.Node>): boolean => {
    if (ts.isBlock(body)) {
      const last = body.statements[body.statements.length - 1];
      return !!last && ts.isReturnStatement(last) && !!last.expression && isAxeValue(last.expression, seen);
    }
    return isAxeValue(body, seen);
  };
  const bindingIsAxe = (binding: Binding | undefined, invoked: boolean, seen: ReadonlySet<ts.Node>): boolean => {
    if (!binding || seen.has(binding)) return false;
    const next = new Set(seen);
    next.add(binding);
    if (ts.isVariableDeclaration(binding) && binding.initializer) {
      // Mutable aliases can be overwritten with a fake analyzer.
      if (!ts.isVariableDeclarationList(binding.parent) || !(binding.parent.flags & ts.NodeFlags.Const)) return false;
      const init = binding.initializer;
      if (invoked) return (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && returnsAxe(init.body, next);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return false;
      return isAxeValue(init, next);
    }
    return invoked && ts.isFunctionDeclaration(binding) && !!binding.body && returnsAxe(binding.body, next);
  };
  const isAxeValue = (node: ts.Expression, seen: ReadonlySet<ts.Node>): boolean => {
    if (isAxeConstructor(node)) return true;
    if (ts.isIdentifier(node)) return bindingIsAxe(visibleBinding(node), false, seen);
    if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node) ||
      ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) {
      return isAxeValue(node.expression, seen);
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) return bindingIsAxe(visibleBinding(node.expression), true, seen);
      if ((ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)) &&
        builderMethods.has(methodName(node.expression)!)) {
        return isAxeValue(node.expression.expression, seen);
      }
    }
    return false;
  };

  let navigates = false;
  let pageFixture = false;
  let helperWithPage = false;
  let axeAnalyzed = false;

  // Only reachable code in a runnable test/hook (or a helper it invokes) may
  // prove axe coverage. Skipped cases and unused helper bodies cannot count.
  const isPageFixture = (fn: ts.ArrowFunction | ts.FunctionExpression): boolean => {
    const first = fn.parameters[0];
    return !!first && ts.isObjectBindingPattern(first.name) &&
      first.name.elements.some((item) => ts.isIdentifier(item.name) && item.name.text === 'page');
  };
  const helperBody = (call: ts.CallExpression): ts.ConciseBody | undefined => {
    if (!ts.isIdentifier(call.expression)) return undefined;
    const binding = visibleBinding(call.expression);
    if (binding && ts.isFunctionDeclaration(binding)) return binding.body;
    if (binding && ts.isVariableDeclaration(binding) && binding.initializer &&
      ts.isVariableDeclarationList(binding.parent) && (binding.parent.flags & ts.NodeFlags.Const) &&
      (ts.isArrowFunction(binding.initializer) || ts.isFunctionExpression(binding.initializer))) {
      return binding.initializer.body;
    }
    return undefined;
  };
  const staticBoolean = (node: ts.Expression): boolean | undefined => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    return undefined;
  };
  const alwaysAbrupt = (statement: ts.Statement): boolean => {
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement) ||
      ts.isBreakStatement(statement) || ts.isContinueStatement(statement)) return true;
    if (ts.isBlock(statement)) {
      for (const child of statement.statements) if (alwaysAbrupt(child)) return true;
      return false;
    }
    if (ts.isIfStatement(statement)) {
      const value = staticBoolean(statement.expression);
      if (value === true) return alwaysAbrupt(statement.thenStatement);
      if (value === false) return !!statement.elseStatement && alwaysAbrupt(statement.elseStatement);
      return !!statement.elseStatement &&
        alwaysAbrupt(statement.thenStatement) && alwaysAbrupt(statement.elseStatement);
    }
    return false;
  };
  const visitExecutable = (node: ts.Node, seen: ReadonlySet<ts.Node>): void => {
    if (ts.isBlock(node)) {
      for (const statement of node.statements) {
        visitExecutable(statement, seen);
        if (alwaysAbrupt(statement)) break;
      }
      return;
    }
    if (ts.isIfStatement(node)) {
      visitExecutable(node.expression, seen);
      const value = staticBoolean(node.expression);
      if (value !== false) visitExecutable(node.thenStatement, seen);
      if (value !== true && node.elseStatement) visitExecutable(node.elseStatement, seen);
      return;
    }
    if (ts.isCallExpression(node)) {
      const method = methodName(node.expression);
      if (method === 'goto' || method === 'newPage') navigates = true;
      if (method === 'analyze' &&
        (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)) &&
        isAxeValue(node.expression.expression, new Set())) axeAnalyzed = true;
      if (ts.isIdentifier(node.expression) && !['expect', 'test', 'describe', 'it'].includes(node.expression.text) &&
        node.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === 'page' ||
          ts.isObjectLiteralExpression(arg) && arg.properties.some((prop) =>
            ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'page'))) {
        helperWithPage = true;
      }
      const body = helperBody(node);
      if (body && !seen.has(body)) {
        const next = new Set(seen);
        next.add(body);
        visitExecutable(body, next);
      }
      // Playwright's test.step invokes its callback inside its surrounding test.
      if (method === 'step' && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'test') {
        for (const arg of node.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) visitExecutable(arg.body, seen);
        }
      }
    }
    // Function declarations/callbacks are not evidence unless actually invoked.
    if (ts.isFunctionLike(node)) return;
    ts.forEachChild(node, (child) => visitExecutable(child, seen));
  };
  const isTestBase = (node: ts.Expression): boolean =>
    ts.isIdentifier(node) && (node.text === 'test' || node.text === 'it');
  const isTestRegistration = (call: ts.CallExpression): boolean => {
    const callee = call.expression;
    return isTestBase(callee) || ts.isPropertyAccessExpression(callee) &&
      (callee.name.text === 'only' || callee.name.text === 'fail') && isTestBase(callee.expression);
  };
  const isHookRegistration = (call: ts.CallExpression): boolean => {
    const callee = call.expression;
    return ts.isIdentifier(callee) && ['beforeEach', 'beforeAll', 'afterEach', 'afterAll'].includes(callee.text) ||
      ts.isPropertyAccessExpression(callee) &&
      ['beforeEach', 'beforeAll', 'afterEach', 'afterAll'].includes(callee.name.text) && isTestBase(callee.expression);
  };
  const isDisabledSuite = (call: ts.CallExpression): boolean => {
    const callee = call.expression;
    return ts.isPropertyAccessExpression(callee) &&
      (callee.name.text === 'skip' || callee.name.text === 'fixme') &&
      ts.isPropertyAccessExpression(callee.expression) &&
      callee.expression.name.text === 'describe' && isTestBase(callee.expression.expression);
  };
  let registered = false;
  const scanRegistrations = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (isDisabledSuite(node)) return;
      if (isTestRegistration(node) || isHookRegistration(node)) {
        registered = true;
        for (const argument of node.arguments) {
          if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) {
            if (isPageFixture(argument)) pageFixture = true;
            visitExecutable(argument.body, new Set());
          }
        }
        return;
      }
      const callee = node.expression;
      // Skip/fixme bodies are deliberately not executed. The registration is
      // still present, so don't fall back to a file-global source traversal.
      if (ts.isPropertyAccessExpression(callee) &&
        (callee.name.text === 'skip' || callee.name.text === 'fixme') && isTestBase(callee.expression)) {
        registered = true;
        return;
      }
    }
    ts.forEachChild(node, scanRegistrations);
  };
  scanRegistrations(parsed);
  // Keep standalone synthetic snippets usable by the fixture regression tests.
  // Unlike before, their unused function declarations are still not scanned.
  if (!registered) visitExecutable(parsed, new Set());
  return (navigates || (pageFixture && helperWithPage)) && !axeAnalyzed;
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
  it('rejects direct, popup, and helper-based navigation without an axe scan', () => {
    const examples = [
      "await page.goto('/sample');",
      "await popup.goto('/sample');",
      "await noJsPage.goto('/sample');",
      "await context.newPage();",
      "await page['goto']('/sample');",
      "test('sample', async ({ page }) => { await openPage(page); });",
      "test('sample', async ({ page }) => { await openPage({ page }); });",
      "await page.goto('/sample'); // new AxeBuilder({ page }).analyze();",
      "await page.goto('/sample'); const unused = 'new AxeBuilder({ page }).analyze()';",
      "await page.goto('/sample'); const axe = new AxeBuilder({ page });",
      "await page.goto('/sample'); /* new AxeBuilder({ page }).analyze(); */",
      "await page.goto('/sample'); const unused = new AxeBuilder({ page }); other.analyze();",
      "async function unused(page: Page) { const audit = new AxeBuilder({ page }); } test('sample', async ({ page }) => { await page.goto('/sample'); const audit = { analyze: async () => {} }; await audit.analyze(); });",
      "test('one', async ({ page }) => { const audit = new AxeBuilder({ page }); }); test('two', async ({ page }) => { await page.goto('/sample'); const audit = { analyze: async () => {} }; await audit.analyze(); });",
      "function make(page) { const unused = new AxeBuilder({ page }); return { analyze: async () => {} }; } await page.goto('/sample'); await make(page).analyze();",
      "await page.goto('/sample'); const make = (page) => { const unused = new AxeBuilder({ page }); return { analyze: async () => {} }; }; await make(page).analyze();",
      "await page.goto('/sample'); const make = () => new AxeBuilder({ page }); await make.analyze();",
      "await page.goto('/sample'); const audit = new AxeBuilder({ page }); { const audit = { analyze() {} }; audit.analyze(); }",
      "await page.goto('/sample'); let audit: any = new AxeBuilder({ page }); audit = { analyze: async () => {} }; await audit.analyze();",
      "function neverCalled(page: Page) { return new AxeBuilder({ page }).analyze(); } test('visits', async ({ page }) => { await page.goto('/sample'); });",
      "test('visits', async ({ page }) => { await page.goto('/sample'); return; await new AxeBuilder({ page }).analyze(); });",
      "test('visits', async ({ page }) => { await page.goto('/sample'); throw new Error('stop'); await new AxeBuilder({ page }).analyze(); });",
      "test('visits', async ({ page }) => { await page.goto('/sample'); if (false) await new AxeBuilder({ page }).analyze(); });",
      "test.skip('does not run', async ({ page }) => { await new AxeBuilder({ page }).analyze(); }); test('visits', async ({ page }) => { await page.goto('/sample'); });",
      "test.describe.skip('disabled suite', () => { test('axe', async ({ page }) => { await new AxeBuilder({ page }).analyze(); }); }); test('visits', async ({ page }) => { await page.goto('/sample'); });",
      "test('visits', async ({ page }) => { await page.goto('/sample'); }); const unused = async (page: Page) => new AxeBuilder({ page }).analyze();",
      "const text = `date ${await popup.goto('/sample')}`;",
    ];
    for (const source of examples) {
      expect(() => assertCoverage([{ name: 'new-screen.spec.ts', source }], {}), source)
        .toThrow(/new-screen\.spec\.ts/);
    }
  });

  it('accepts actual axe analysis, including a named builder and an axe factory', () => {
    expect(() => assertCoverage([
      { name: 'with-axe.spec.ts', source: "await page.goto('/sample'); await new AxeBuilder({ page }).analyze();" },
      { name: 'other-page.spec.ts', source: "await popup.goto('/sample'); const a = await new AxeBuilder({ page }).withTags(['wcag2a']).analyze();" },
      { name: 'bound-axe.spec.ts', source: "await page.goto('/sample'); const audit = new AxeBuilder({ page }); await audit.analyze();" },
      { name: 'axe-factory.spec.ts', source: "await page.goto('/sample'); const make = (page) => new AxeBuilder({ page }); await make(page).analyze();" },
      { name: 'returned-factory.spec.ts', source: "await page.goto('/sample'); function make(page) { const audit = new AxeBuilder({ page }); return audit; } await make(page).analyze();" },
      { name: 'returned-arrow.spec.ts', source: "await page.goto('/sample'); const make = (page) => { const audit = new AxeBuilder({ page }); return audit; }; await make(page).analyze();" },
      { name: 'alias-chain.spec.ts', source: "await page.goto('/sample'); const one = new AxeBuilder({ page }); const two = one; await two.analyze();" },
      { name: 'called-helper.spec.ts', source: "function scan(page: Page) { return new AxeBuilder({ page }).analyze(); } test('visits', async ({ page }) => { await page.goto('/sample'); await scan(page); });" },
      { name: 'called-arrow.spec.ts', source: "const scan = async (page: Page) => new AxeBuilder({ page }).analyze(); test('visits', async ({ page }) => { await page.goto('/sample'); await scan(page); });" },
      { name: 'returned-analysis.spec.ts', source: "test('visits', async ({ page }) => { await page.goto('/sample'); return new AxeBuilder({ page }).analyze(); });" },
      { name: 'axe-hook.spec.ts', source: "test.beforeEach(async ({ page }) => { await new AxeBuilder({ page }).analyze(); }); test('visits', async ({ page }) => { await page.goto('/sample'); });" },
      { name: 'axe-step.spec.ts', source: "test('visits', async ({ page }) => { await page.goto('/sample'); await test.step('audit', async () => new AxeBuilder({ page }).analyze()); });" },
      { name: 'no-nav.spec.ts', source: "test('sample', async ({ page }) => { await expect(page).toHaveTitle('sample'); });" },
      { name: 'pure.spec.ts', source: "expect(add(2, 3)).toBe(5);" },
      { name: 'comment.spec.ts', source: "// await page.goto('/sample');\nconst literal = 'page.goto(';" },
    ], {})).not.toThrow();
  });

  it('documents only the existing, individually justified exceptions', () => {
    for (const [name, reason] of Object.entries(knownWithoutAxe)) {
      expect(name.endsWith('.spec.ts'), name).toBe(true);
      expect(reason.trim().length, name + ': exception needs a specific reason').toBeGreaterThan(30);
    }
    // W15-2 merged. Its console-error suite deliberately relies on the page-level axe sweep.
    const specs = currentSpecs();
    const byName = new Map(specs.map(({ name, source }) => [name, source]));
    const stale = Object.keys(knownWithoutAxe).filter((name) =>
      !byName.has(name) || !needsAxe(byName.get(name)!));
    expect(stale, 'Remove an exception when its spec starts running axe or stops navigating').toEqual([]);
    expect(() => assertCoverage(specs, knownWithoutAxe)).not.toThrow();
  });
});
