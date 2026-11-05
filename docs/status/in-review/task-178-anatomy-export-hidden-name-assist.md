# Task 178 assist — picture exports do not name hidden selections

- **Status:** IN_REVIEW — stacked proposal based on Anatomy Lab PR #290 at `ad5304355678dbc7a806ff7b251f8c4c3167f9be`.
- **Problem:** a student could select a structure, hide it, then export a picture. The file name still named that hidden structure even though the picture did not display it.
- **Fix:** name the selected structure in the exported file only when that structure is visible. Otherwise, use the existing system-level file name.
- **Regression:** `tests/e2e/anatomy-lab.spec.ts` covers selecting and hiding fixture cube A, then exporting a square PNG without that structure's name.
- **Scope:** `src/islands/AnatomyLab.tsx`, one browser test and this status note. No changes to model files, labels, clinical content, draft gates, authentication, deployment or dependencies.
- **Validation:** the exact source edit and new test were checked through GitHub. The full Node 24, Playwright and CI checks were not run locally in this connected-only environment. Tests and review must pass before integration.
- **Integration:** retain this as a draft assist and reconcile with the newer Anatomy Lab and recovery/visibility fixes before adoption. Do not merge this directly to `staging` or `main`; the anatomy lab still requires human review and approval.
