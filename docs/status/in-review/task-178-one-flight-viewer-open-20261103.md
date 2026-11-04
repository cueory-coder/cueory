# Task 178 — guard duplicate Anatomy Lab viewer starts

status: Task 178 Anatomy Lab single-flight startup and unmount cancellation, in review on PR #547. Exact-head browser CI and lead approval pending.

## Change
- One startup at a time, including rapid repeated activation of **open the anatomy lab**.
- Drop async imports/frame waits when the student navigates away before the viewer opens.
- On unmount, invalidate pending startups before disposing WebGL resources.
- Keep the existing **try 3D again** error-recovery path usable after a failed startup.

## Scope
- New pure startup gate and four unit regressions.
- One focused change to the anatomy island's startup and unmount lifecycle.
- No anatomy names, models, assets, source licenses, clinical statements, draft approvals, security or deployment settings, or dependencies changed.

## Integration
- Based on Task 178 reconciliation PR #414 at `ee3abc45859f0d3765092c45806c7b15fa18a1ac`.
- Stack onto the lead's Task 178 integration. Do not merge directly into staging or production.
- Full npm check, build, Vitest and Playwright were **not executed locally**, because this connector session has no repository checkout or installed dependencies. Exact-head CI and a keyboard/touch retry smoke test are required.
