status: Anatomy lab review support for Task 178 — a read-only local report generator at `scripts/anatomy-review-report.mjs`, plus focused tests. It does not touch the lead-owned anatomy viewer, models, source records, production assets, approvals, branch settings, or deployment.

purpose: Every model under `content/visuals/anatomy-*.json` has a set of exact BodyParts3D names and source quotes. The report lists each system's publication status, release, local `.glb` size, layer counts, and every structure's official name, group, layer and citation. It preserves the records as data, so the founder can inspect them before approving a draft.

run: `node scripts/anatomy-review-report.mjs --system heart > /tmp/heart-review.md` for one system, or `node scripts/anatomy-review-report.mjs > /tmp/all-anatomy-review.md` for all systems. The report is printed, never committed or published automatically. `--help` shows usage. No dependency, network connection or secret is needed.

checks: A missing model, invalid or missing source, unknown layer, repeated structure ID, invalid status, or unsafe reference URL stops the report with a file-specific error. These are human-friendly checks; the existing model tests still validate GLB node matching and triangle/byte budgets. The report cannot verify anatomical correctness by itself and cannot authorize publication.

review: Check geometry visually against the official reference, exact label wording, grouping, layers, attribution, and lesson links. Keep all anatomy content `draft` until Christian approves it. This change is independent of the open anatomy lab UI pull request #290.

validation: `node --check scripts/anatomy-review-report.mjs` and local synthetic-file smoke checks; Vitest and Playwright CI results pending. No live site change requested.
