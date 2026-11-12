# Anatomy lab — release QA checklist

This is the acceptance checklist for the anatomy models (Task 177) and interactive lab (Task 178). It is **not** approval to publish. The lab is a draft until its source data, interaction, accessibility and release gates are checked by a human.

The product plan and source restrictions remain in [VISUALS.md](VISUALS.md). The current implementation and its open review are in [PR #290](https://github.com/lilchristxan/Cueory/pull/290).

## Release rule

- **Staging first.** A preview can show draft models with a visible draft notice. Never publish a draft model, label or fixture on the production site.
- **No new clinical facts.** Every real structure name must come from its reviewed BodyParts3D source file. The interface must not invent a name or interpretation.
- **Accessible without gestures.** Selecting, turning, zooming and exploring a model must have keyboard and tap paths. A student unable to use 3D must still have a usable text route.
- **Founder review before publication.** Model and label review, licensing, CI, an actual staging check and the required approval are separate gates. A green build does not grant content approval.

## 1. Data and publication checks

| Check | Pass condition | Evidence to record |
| --- | --- | --- |
| Model-to-label integrity | Every model node has exactly one official label, with no missing or repeated IDs. | `tests/unit/anatomy-models.test.ts`, `tests/unit/anatomy-release4.test.ts` |
| Rights and attribution | The model's release, source and CC BY 4.0 credit are visible under the model and on every exported picture. | Source-file review and screenshots of all three export sizes |
| Draft isolation | A `main` build contains no unapproved `.glb` under `dist/models/anatomy/`, no draft labels in page HTML and no test fixture endpoint. | Inspect actual built `dist/`, not just the unit-test gate |
| Unknown build isolation | A build without preview variables also excludes drafts and fixtures by default. | Production-style build and actual artifact inspection |
| Preview transparency | A staging or explicitly opted-in local preview marks draft models as drafts. | Preview screenshot and build variables |
| Human content sign-off | Every model and its source names are reviewed before changing its status to `approved`. | Review sheet and explicit approval, not just a test result |

The code paths to check are `src/visuals/prunedrafts.ts`, `src/islands/anatomylab.ts` and `src/pages/preview/anatomy-lab.astro`. The test fixture is not anatomy and must never be labeled as real anatomy.

## 2. Student flows

Each case needs a browser test **and** a manual check on the locked staging preview. Use the actual BodyParts3D data for whole-body cases and the fixture for repeatable interaction cases.

| Case | Steps | Required result |
| --- | --- | --- |
| Open the lab | Visit the page, then tap **open the anatomy lab**. | No 3D engine or model download before the tap. An explicit loading state appears afterward. |
| Change systems | Open one system, switch while its model is downloading, then switch again. | The old system is cleared immediately. Late files cannot appear in the new system. |
| Recover from failed model load | Make the first `.glb` request fail, then restore the network. | The same system can be retried without refreshing the page. A clear error is announced. |
| Recover from unavailable 3D | Simulate failure to initialize WebGL. | The student can still search and read structure names and has a clear retry option for 3D. |
| Search and select | Search for a name, select it with a tap, then repeat by keyboard. | Both paths choose the same structure and show its original, source-provided name. |
| Open deeper layers | Enter **whole body**, open a deeper layer and then return to skin. | Missing files are fetched only when requested. Loaded files are not downloaded again. |
| Mixed-file layers | Load a file containing structures from more than one layer, then open another partially loaded layer. | All remaining required files load. A partly visible layer is not treated as complete. |
| Load-state wording | Open the whole body before deeper layers finish downloading. | Unfetched structures say **not loaded yet**. Only a fetched file with no matching mesh may say **not in this model**. |
| A failed layer request | Fail one file while another in the same layer succeeds, then retry. | Successful structures remain available, and retry fetches only failed files. |
| Conflicting actions | Start **show all**, then select **show only this** while downloads remain pending. | The newer visibility choice remains in effect when the older downloads finish. |
| Find It guided practice | Answer incorrectly, answer correctly using the labeled list and keyboard, then use **show me** and **next**. | Right/wrong/reveal feedback is clear in words, keyboard and tap paths work, and no score or first-try assessment claim appears. The requested target becomes visible and stays selected when revealed. |
| Picture export | Export phone, wide and square formats, then change systems during a delayed export. | Dimensions, visible credits and names are correct. No stale-system picture is downloaded after switching. |
| Preset views | Tap **front**, **back**, **left side**, **right side** and **top**, then press 1 to 5 and 0 on the focused 3D view. | Each one moves the camera at once and is announced in words. **reset view**, 0 and Home return to the start. Nothing needs dragging. (`tests/e2e/anatomy-lab-study-modes.spec.ts`) |
| Keys panel | Open **keys** by keyboard, read it, press Escape. | The panel lists every key the 3D view answers to; Escape closes it and focus returns to the **keys** button. |
| Name it guided practice | Start **name it**; pick a wrong name, pick the right one, type a name, use **show me**, **see it alone** and **next** to the end of the round. | Every name offered comes from the system's own label file. Right, wrong and shown are said in words with a symbol. No score. The structure list, labels and name card are put away so the answer is not on screen, and stopping restores what was showing. |
| Worksheet | Make a worksheet with 1 to 12 structures showing, show answers, print, save the picture. | The picture has numbers, not names, with the source credit printed on it; the list has one blank per number; the credit, license and scope are written out under it; a draft says draft. Printing prints only the worksheet. With none or more than 12 showing, a sentence says why. |
| Download notes | Read the cover and the loading message. | A real system's model size is shown, rounded up, measured from the built file. The test shapes promise no size. |
| Lesson link | Open `/preview/anatomy-lab?system=<key>&structure=<id>`, then a malformed one. | The lab opens on that system and selects that structure once its model is ready. A malformed or unknown value is ignored and the normal first view opens. |

Do not mark these as passed merely because an existing fixture test succeeds. Network races and mixed-file layers require their own assertions.

## 3. Access and performance

| Check | Pass condition |
| --- | --- |
| Phone layout | At 320 px and 390 px, no horizontal page scrolling, clipped controls or unreachable structure names. |
| Large structure catalog | The entire source catalog remains searchable, but the first view does not force navigation through every structure button at once. Group expansion, bounded results or an equivalent accessible design is acceptable. |
| Keyboard and tap | Search, structure selection, layer toggle, peel and restore, orbit, zoom, reset and quiz can be operated without dragging. |
| Reduced motion | There is no forced animation when `prefers-reduced-motion: reduce` is set. |
| Screen reader | Names, loading, errors, quiz outcomes and hidden/not-yet-loaded states are distinguishable in words, not color alone. |
| No JavaScript or WebGL | A meaningful fallback is shown. Failed 3D initialization must not hide the available study text. |
| Single-system budget | Each published model stays within 3 MB and 150,000 triangles, as defined in `src/islands/bodyviewer-logic.ts`. |
| Whole-body budget | Only the outer layer loads initially. Test a full **show all** on a mid-range phone before accepting its cumulative size and triangle cost. |
| Browser coverage | Chromium phone, tablet and desktop. Include WebKit and Firefox at the release gate when supported by the repository configuration. |

## 4. Verification and handoff

From an environment with the repository's pinned Node version and installed dependencies:

```sh
npm ci
npm run check
npm run build
npm test
npm run test:e2e -- tests/e2e/anatomy-lab.spec.ts
```

For the **production gate**, run a separate build using `WORKERS_CI=1` and `WORKERS_CI_BRANCH=main`, then inspect the generated HTML and model files. For the **draft preview**, run a separate build with `CUEORY_ANATOMY_DRAFTS=1`; do not reuse the other build's `dist/` as evidence. The preview browser tests require a build that includes their fixture.

Before approving a release, record:

1. Exact commit SHA and staging preview link.
2. CI, CodeQL, unit-test and browser-test results for that SHA.
3. Actual production-build artifact inspection showing no draft material.
4. Screenshots or recordings for the phone, keyboard, unavailable-3D and export cases.
5. The reviewed model-source sheets and the founder's publication approval.

**Until all release conditions are met, keep the anatomy lab in preview and the anatomy data marked draft.**
