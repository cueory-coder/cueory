status: T34 partial automated page-quality sweep and baseline failure inventory; blocked on protected auth repair, needs-christian, not Ready.

# T34 accessibility sweep: preliminary findings

Base: staging `1de038ad2de60c7516106aa98728925ab910e2a4`. This is an incomplete audit, not a Ready claim. No product or protected auth code is changed.

The new sweep discovers every built HTML route (48 in the normal build, including a real missing-route 404), tests both palettes in each configured viewport, and requires 44 px targets, distinct keyboard focus, and no root horizontal overflow. It includes header/footer controls and native input labels. The existing keyboard audit is shared without weakening its assertions. A keyboard-only skip link is measured when focused, rather than its intentionally clipped unfocused box.

## Execution and limits

- `npm run check`: PASS, 663 files, 0 errors / 0 warnings / 24 hints after final test edits.
- `npm run build`: PASS, normal build. No runtime source changed after this build.
- `npx --no-install vitest run --maxWorkers=2`: 241 files / 5,875 PASS / 3 existing skips. Case-sensitive sibling TMPDIR used.
- Existing keyboard regression fixtures: 5/5 PASS on desktop, original assertions/timeouts retained.
- First browser attempt interrupted deliberately after it exposed a false positive for the hidden skip-link box: 147 failed, 2 passed, 142 unexecuted due interruption. This is not a complete matrix or clean browser result.
- Corrected full-matrix attempt used phone/tablet/desktop projects, each running Light and Evening; it reached desktop routes but was interrupted by session/environment restart before writing its JSON report. No total/pass claim is made. Remaining per-test error contexts survive; another full run is required.
- Owned local preview configs only change server port/cwd/testDir and serve the already-built dist. No assertion or timeout is loosened. WebKit/Firefox were not run.
- 1,039 unchanged baseline blobs independently hash-match staging; only the existing sweep extraction and new tests differ.

## Findings reported before repairs

The table below preserves findings collected in the first partial run after excluding its known hidden-box false positive. Game-grid cells are grouped by measured size rather than repeating their sample letters. These remain findings to repair/reverify, not a complete page inventory.

| Route | Finding | Observed combinations |
| --- | --- | --- |
| `/auth/callback` | a back to sign in: target 110.4×22.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/courses` | a coming soon page: target 116.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/cards` | a See or clear them: target 113.2×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/cards` | a back to the lesson: target 116.7×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/cards` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/cards` | a learn these cards in learn mode: target 202.7×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/fill-in` | a back to the lesson: target 116.7×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/fill-in` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/label-it` | a back to the lesson: target 116.7×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/label-it` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/learn-mode` | a back to the lesson: target 116.7×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/learn-mode` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/matching` | a back to the lesson: target 116.7×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/matching` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/organizer` | a back to the lesson: target 116.7×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/organizer` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/study-skills/questions` | a disclaimer: target 67.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/learn/video-sample` | a See the privacy page.: target 136.9×18.0px | tablet/dark, tablet/light |
| `/learn/video-sample` | a See the privacy page.: target 331.8×40.5px | phone/dark, phone/light |
| `/learn/video-sample` | a Transcript: target 66.6×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/play` | button: keyboard focus has no visible outline | phone/light, tablet/dark, tablet/light |
| `/play` | game-grid cell: target 31.3×31.3px | phone/dark, phone/light |
| `/play` | game-grid cell: target 32.5×32.5px | phone/dark, phone/light |
| `/play` | input#pillo-guess: keyboard focus has no visible outline | tablet/dark, tablet/light |
| `/preview/admin-flags` | a /learn/study-skills/questions: target 31.0×153.0px | phone/dark, phone/light |
| `/preview/admin-flags` | a /play: target 24.7×40.5px | phone/dark, phone/light |
| `/preview/admin-flags` | a /play: target 32.1×18.0px | tablet/dark, tablet/light |
| `/preview/anatomy-text` | a back to the 3D view: target 154.8×22.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/preview/body-viewer` | a Privacy.: target 51.2×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/preview/email` | a unsubscribe from reminders: target 184.3×18.0px | phone/dark, phone/light, tablet/dark, tablet/light |
| `/preview/email` | summary plain-text version: target 308.0×29.7px | phone/dark, phone/light |
| `/preview/email` | summary plain-text version: target 636.6×29.7px | tablet/dark, tablet/light |
| `/preview/survey` | input INPUT: target 13.0×13.0px | phone/light, tablet/dark, tablet/light |

The corrected detector also records a focused skip link around 116.8 × 29.7 px on affected routes. Existing grid exceptions in older tests (24 px for selected game grids) are intentionally not imported into this strict 44 px sweep. No horizontal-overflow failure was recorded in the preserved findings; this does not establish a completed all-page pass.

Correction to preliminary board note 4224718972: the “back to sign in” finding is on `/auth/callback`, not the two-factor page. Its 110.4 × 22 px anchor is in protected auth code.

## Required handoff

The task requires a protected auth-code repair. Per the user's hard rule, open this MR as Draft with `needs-christian` and stop; no auth edit, test exemption, merge, approval or Ready comment. Christian/lead should route that repair and the game-grid minimum-size design conflict, then resume the complete matrix and small unprotected repairs. The new guard remains failing rather than hiding baseline findings.
