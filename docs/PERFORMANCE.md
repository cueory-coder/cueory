# Performance budget check

A simple size check for the built website. It estimates how much HTML, JavaScript, and CSS a browser may download when opening each page.

Run after a complete build, using the project’s pinned Node version:

```sh
npm run build
node scripts/perf-budget.mjs dist
# Machine-readable gzip bytes for calibration or CI reports:
node scripts/perf-budget.mjs dist --json
```

The check reads every `.html` file in `dist/` and counts:

| Type | Maximum gzip size per page |
| --- | ---: |
| HTML | 40 KiB |
| JavaScript | 200 KiB |
| CSS | 70 KiB |
| Combined HTML + JavaScript + CSS | 300 KiB |

Default limits are in `BUDGETS` and exceptions are in `ROUTE_BUDGETS` at the top of `scripts/perf-budget.mjs`. The check counts each page’s HTML, locally linked scripts and stylesheets, Astro island scripts (including hydration helpers), inline module script imports, and their statically imported JavaScript and CSS. A shared file is counted once per page, not once per reference. Query strings do not make duplicate files. All sizes use Node's `zlib.gzipSync`.

The report prints **PASS** or **OVER** for each page and identifies which limit was exceeded. A limit breach, missing local file, invalid build directory, or unsafe file link causes a non-zero exit status. The checker does not change any files.

**Not covered:** images, fonts, third-party downloads, lazy-loaded modules, time spent executing JavaScript, and real network performance. Anatomy model files (such as `.glb` and `.gltf`) are excluded because they have their own separate **3 MB check**. Inline scripts and styles are included in the HTML size rather than counted twice. This is a size guard, not a substitute for browser performance testing.

The limits are starting thresholds. Before making them mandatory in CI, Claude should compare the report with a complete staging build and confirm the thresholds are appropriate. W10 does not change CI or `package.json`.

## Route-specific budgets and staging measurements

`ROUTE_BUDGETS` in `scripts/perf-budget.mjs` is one named table of **temporary, unmeasured** exceptions. Every page not in the table uses the default budget. The scanner includes the effective limits beside each route in its plain and JSON reports. An unrecognized route safely receives the defaults, rather than silently escaping the budget. Each limit is inclusive: exceeding it by one gzip byte is a failure.

| Route | Budget profile | Provisional JS limit | Provisional combined limit | Measured staging gzip (HTML / JS / CSS / total) |
| --- | --- | ---: | ---: | --- |
| `play.html` | Daily games | 240 KiB | 360 KiB | **Not measured** |
| `play/stat.html` | Stat game | 220 KiB | 340 KiB | **Not measured** |
| `play/hello-cards.html` | Hello cards game | 220 KiB | 340 KiB | **Not measured** |
| `preview/anatomy-lab.html` | Anatomy preview | 260 KiB | 380 KiB | **Not measured** |
| `preview/body-viewer.html` | Body viewer preview | 260 KiB | 380 KiB | **Not measured** |
| Other HTML routes | Default | 200 KiB | 300 KiB | **Not measured** |

The default HTML limit remains 40 KiB and CSS remains 70 KiB on **every** route, including overrides. Overrides are placeholders for calibration, **not measured route sizes** and not proof that any page is fast. This table must not be treated as a verified baseline.

**Calibration requested from Claude in issue #10:** after building the current staging code, run `node scripts/perf-budget.mjs dist --json` and send the complete report. Record the build commit and Node version. Copy measured gzip values into the table above, then set each default or route-specific limit to at least **25% above its measured size** (round up to full KiB), while retaining a distinct performance target. If a measured page exceeds a proposed target, discuss the budget before raising it. Only a verified staging build can turn these provisional limits into reviewed budgets.

`--json` emits `schemaVersion: 1`, gzip byte counts, default and named route budgets, per-page effective limits, `breaches`, and the pass/fail totals. It still exits non-zero if any route breaches its limit. It does not change the build or require a new dependency.

## Interactive loading audit (W10-3)

Astro's `client:load` starts a component as soon as the page loads. `client:only="react"` avoids server rendering and builds the component in the browser. Both can add work during the initial visit. `client:idle` waits for idle time and `client:visible` waits until the component comes near the screen, but a change is safe only if it preserves the existing browser behavior, focus, and no-JavaScript fallback.

`tests/unit/hydration-directives.test.ts` searches all `.astro` files under `src/pages/` and `src/components/`. It ignores comments and quoted text, identifies eager React component directives, and compares them with a path-specific allow-list. Every existing `client:load` or `client:only` has a one-line reason and expected count. A new eager component or an unexpected duplicate fails the test until an owner explains it. The inventory does **not** automatically rewrite pages or authorize new third-party JavaScript.

Potential improvements are tracked as suggestions in issue #10. In particular, a noncritical list on `/breaks` or a preview below the fold might eventually use `client:idle` or `client:visible`, after the owning worker verifies behavior on mobile, keyboard, tap, reduced motion, and screen readers. Browser-only games and account tasks must retain their current functionality before any directive changes are considered. W10-3 intentionally changes no page or component.

The hydration tests also protect **no-JavaScript accessibility fallbacks** on core study, progress, and onboarding pages, plus clear JavaScript-needed guidance on account and sign-in forms. The nested-component fixture prevents a new eager island from bypassing the audit merely because it was placed in another directory. These checks do not replace the browser accessibility suite.
