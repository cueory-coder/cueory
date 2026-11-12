# Performance budget check

A simple size check for the built website. It estimates how much HTML, JavaScript, and CSS a browser may download when opening each page.

Run after a complete build, using the project’s pinned Node version:

```sh
npm run build
node scripts/perf-budget.mjs dist
```

The check reads every `.html` file in `dist/` and counts:

| Type | Maximum gzip size per page |
| --- | ---: |
| HTML | 40 KiB |
| JavaScript | 200 KiB |
| CSS | 70 KiB |
| Combined HTML + JavaScript + CSS | 300 KiB |

Every limit is in the `BUDGETS` table at the top of `scripts/perf-budget.mjs`. The check counts each page’s HTML, locally linked scripts and stylesheets, Astro island scripts (including hydration helpers), inline module script imports, and their statically imported JavaScript and CSS. A shared file is counted once per page, not once per reference. Query strings do not make duplicate files. All sizes use Node's `zlib.gzipSync`.

The report prints **PASS** or **OVER** for each page and identifies which limit was exceeded. A limit breach, missing local file, invalid build directory, or unsafe file link causes a non-zero exit status. The checker does not change any files.

**Not covered:** images, fonts, third-party downloads, lazy-loaded modules, time spent executing JavaScript, and real network performance. Anatomy model files (such as `.glb` and `.gltf`) are excluded because they have their own separate **3 MB check**. Inline scripts and styles are included in the HTML size rather than counted twice. This is a size guard, not a substitute for browser performance testing.

The limits are starting thresholds. Before making them mandatory in CI, Claude should compare the report with a complete staging build and confirm the thresholds are appropriate. W10 does not change CI or `package.json`.
