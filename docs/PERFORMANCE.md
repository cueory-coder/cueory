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

Default limits are in `BUDGETS`, and named route exceptions are in `ROUTE_BUDGETS` at the top of `scripts/perf-budget.mjs`. The check counts each page’s HTML, locally linked scripts and stylesheets, Astro island scripts (including hydration helpers), inline module script imports, and their statically imported JavaScript and CSS. A shared file is counted once per page, not once per reference. Query strings do not make duplicate files. All sizes use Node's `zlib.gzipSync`.

The report prints **PASS** or **OVER** for each page and identifies which limit was exceeded. A limit breach, missing local file, invalid build directory, or unsafe file link causes a non-zero exit status. The checker does not change any files.

**Not covered:** images, fonts, third-party downloads, lazy-loaded modules, time spent executing JavaScript, and real network performance. Anatomy model files (such as `.glb` and `.gltf`) are excluded because they have their own separate **3 MB check**. Inline scripts and styles are included in the HTML size rather than counted twice. This is a size guard, not a substitute for browser performance testing.

The limits are starting thresholds. Before making them mandatory in CI, Claude should compare the report with a complete staging build and confirm the thresholds are appropriate. W10 does not change CI or `package.json`.

## Route-specific budgets and staging measurements

`ROUTE_BUDGETS` in `scripts/perf-budget.mjs` is one named table of **temporary, provisional** exceptions. Every page not in the table uses the default budget. The scanner includes the effective limits beside each route in its plain and JSON reports. An unrecognized route safely receives the defaults, rather than silently escaping the budget. Each limit is inclusive: exceeding it by one gzip byte is a failure.

Measured gzip bytes are listed as **HTML / JavaScript / CSS / total**. Both builds use exact staging `1cf4542545f767f46a4c2b8fbfaab55b29a8bc9e`, Node 24.22.1 and its unchanged lockfile. The scanner was published !54 head `66291976`; the type-contract repair has byte-identical runtime emission and produces the same JSON. The default local build leaves draft previews off. The second build sets `CUEORY_ANATOMY_DRAFTS=1`, which also enables the sample Stat/hello-cards surfaces. Both real CLI reports pass 47/47 pages.

| Route | Budget profile | Provisional JS limit | Provisional combined limit | Default-build gzip bytes | Draft-enabled gzip bytes |
| --- | --- | ---: | ---: | --- | --- |
| `play.html` | Daily games | 240 KiB | 360 KiB | 18,264 / 111,567 / 23,028 / 152,859 | 18,491 / 111,567 / 23,028 / 153,086 |
| `play/stat.html` | Stat game | 220 KiB | 340 KiB | 10,652 / 86,717 / 19,744 / 117,113 | 11,131 / 93,581 / 19,744 / 124,456 |
| `play/hello-cards.html` | Hello cards game | 220 KiB | 340 KiB | 10,763 / 86,717 / 19,744 / 117,224 | 15,280 / 89,241 / 19,744 / 124,265 |
| `preview/anatomy-lab.html` | Anatomy preview | 260 KiB | 380 KiB | 10,429 / 86,717 / 19,744 / 116,890 | 29,110 / 102,125 / 19,744 / 150,979 |
| `preview/body-viewer.html` | Body viewer preview | 260 KiB | 380 KiB | 11,568 / 91,520 / 19,744 / 122,832 | 11,568 / 91,520 / 19,744 / 122,832 |
| Other HTML routes (per-category maxima) | Default | 200 KiB | 300 KiB | 18,741 / 123,847 / 20,131 / 154,117 | 23,927 / 123,847 / 20,131 / 154,117 |

The default HTML limit remains 40 KiB and CSS remains 70 KiB on **every** route, including overrides. The limits remain placeholders for calibration, **not measured route sizes** and not proof that any page is fast. The recorded sizes are measurements of these exact builds, not approved thresholds. The final row contains independent maxima that can come from different pages. Do not calibrate enabled anatomy/game previews from the smaller default shell measurements.

Both measured configurations also fit the existing global default limits with at least 25% headroom in every category. These measurements therefore do not require the higher provisional per-route exceptions. Keep limit selection separate from measurement and retain the parent limits until calibration is reviewed.

**Calibration for Claude in issue #10:** after the accepted parent lands, refresh these measurements on that exact staging commit with the required draft/preview configuration. Run `node scripts/perf-budget.mjs dist --json` and send the complete report. Record the build commit and Node version. Update the measured gzip values above, then review and set each default or route-specific limit to at least **25% above its measured size** (round up to full KiB), while retaining a distinct performance target. If a measured page exceeds a proposed target, discuss the budget before raising it. Only a verified staging build can turn these provisional limits into reviewed budgets.

`--json` emits `schemaVersion: 1`, gzip byte counts, default and named route budgets, per-page effective limits, `breaches`, and the pass/fail totals. It still exits non-zero if any route breaches its limit. It does not change the build or require a new dependency.

The scanner checks known route names against Astro's `build.format: 'file'`. The unit tests guard against silently losing the route overrides if the output format changes or a named page is deleted. Missing linked JS or CSS is an error, not a passing scan.
