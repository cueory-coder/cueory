# Accessibility features and test coverage

This guide maps Cueory's existing accessibility checks to their test files. It describes coverage in the repository,
not a claim that every route has passed or that automated checks replace assistive-technology testing.

## Site-wide checks

| Feature | Existing coverage |
| --- | --- |
| Page structure and skip navigation | [a11y-sweep.spec.ts](../tests/e2e/a11y-sweep.spec.ts) discovers built HTML routes, expects one H1 and one `main#main`, checks that “skip to content” is the first Tab stop, and activates its `#main` link. |
| Keyboard focus | The same sweep checks reachable controls for a visible focus change and reports unreachable controls or unfinished Tab traversal. It waits for islands to hydrate before inspecting them. |
| Automated accessibility rules | The sweep runs axe with the `wcag2a`, `wcag2aa`, `wcag21aa` and `wcag22aa` tags. Component suites also run axe in their tested states. These tags describe the rules requested, not a conformance certification. |
| Evening palette and contrast | [dark-mode.spec.ts](../tests/e2e/dark-mode.spec.ts) checks its listed routes in forced dark mode, including contrast and backgrounds. [tokens.test.ts](../tests/unit/tokens.test.ts) checks brand colors and specific contrast combinations. |
| Readable body typography | [typography.test.ts](../tests/unit/typography.test.ts) checks Lato body/interface fonts and line-height tokens of at least 1.5 for non-display text styles. It checks tokens, not every rendered text element. |
| Responsive controls and layout | Page and component suites include overflow and target-size checks at their stated widths. For example, [word-path.spec.ts](../tests/e2e/word-path.spec.ts) covers 320 px and 390 px layouts, and [states.spec.ts](../tests/e2e/states.spec.ts) checks 320 px overflow. |

## Navigation and shared controls

| Feature | Existing coverage |
| --- | --- |
| Footer links and theme choice | [footer-theme.spec.ts](../tests/e2e/footer-theme.spec.ts) checks tap/keyboard expansion, theme persistence, radio-option arrow keys, a visible focus ring, and axe with the links open in both palettes. |
| Menu and account corner | [pages.spec.ts](../tests/e2e/pages.spec.ts) covers menu opening/closing, keyboard controls, and the signed-out account menu. |
| Modal preview | The same page suite checks Escape, focus return and focus staying inside the open study-mode preview. |
| Promotional panel | [promo.spec.ts](../tests/e2e/promo.spec.ts) checks focus on opening, Escape and focus return, close controls, reduced-motion appearance, and suppression on study screens. |
| Header visibility | [header-tuck.spec.ts](../tests/e2e/header-tuck.spec.ts) checks that keyboard focus restores the header and that reduced motion leaves it visible and clickable. |
| Reporting a problem | [flag-button.spec.ts](../tests/e2e/flag-button.spec.ts) checks keyboard operation and axe on its named routes, including the open report form. It is not an every-route submission test. |

## Study interactions

| Feature | Existing coverage |
| --- | --- |
| Cards by keyboard | [cards-modern.spec.ts](../tests/e2e/cards-modern.spec.ts) covers Space/Enter flip, rating shortcuts, arrow navigation and starring. [cardkeys.test.ts](../tests/unit/cardkeys.test.ts) checks that shortcuts do not steal typing or modified key presses. |
| Learn mode by keyboard | [learn-modern.spec.ts](../tests/e2e/learn-modern.spec.ts) completes sample rounds by keyboard at its named sizes and checks wrong-answer words/symbols, reduced motion and axe in both palettes. |
| Matching and Organizer alternatives to dragging | [matching-organizer-modern.spec.ts](../tests/e2e/matching-organizer-modern.spec.ts) checks complete keyboard flows, progress/announcements, and Organizer's tap-friendly pick/destination controls. |
| Word Path | [word-path.spec.ts](../tests/e2e/word-path.spec.ts) completes the puzzle with arrow keys and Enter, clears picks with Escape, and checks feedback in words and reduced-motion behavior. |
| Video controls and reading links | [lesson-video.spec.ts](../tests/e2e/lesson-video.spec.ts) checks keyboard activation of the play cover, visible privacy/transcript links, reduced-motion cover behavior and narrow layouts. |
| No-JavaScript alternatives | [pages.spec.ts](../tests/e2e/pages.spec.ts) checks full lesson text and card answers without JavaScript, plus explanatory alternatives for Learn and Matching. This does not establish fallbacks for every island. |
| Loading and empty states | [states.spec.ts](../tests/e2e/states.spec.ts) checks accessible loading messages, hidden decorative shapes, labeled empty states, real navigation actions, reduced-motion loaders and axe in both palettes. |

Reduced-motion coverage is component-specific. Cards, Learn mode, Word Path, the header, footer, video cover, promo
and loading states each have checks in the suites above. The Matching/Organizer suite currently allows opacity-only
feedback under reduced motion. [motion-tokens.test.ts](../tests/unit/motion-tokens.test.ts) separately checks that
view transitions are disabled under reduced motion. Do not read these checks as proof that every animation stops.

## Run the checks

From the repository root after `npm ci`:

```sh
npm run build
npm run test:e2e -- tests/e2e/a11y-sweep.spec.ts
npm run test:e2e -- tests/e2e/footer-theme.spec.ts tests/e2e/dark-mode.spec.ts
npm test -- tests/unit/typography.test.ts tests/unit/tokens.test.ts tests/unit/cardkeys.test.ts
```

`npm run verify` runs type checking, the build, unit tests and browser tests. Playwright serves the built `dist/`
folder. Its default projects are Chromium phone (390 × 844), Evening phone, tablet (820 × 1180) and desktop
(1440 × 900). `ALL_ENGINES=1` adds WebKit phone/desktop and Firefox desktop. See
[playwright.config.ts](../playwright.config.ts) and [package.json](../package.json).

## Known coverage limits

The route-wide sweep skips the Evening phone project because the dark-mode suite covers that palette separately.
Its `/play` Tab-only walk may be marked `fixme` because the crossword uses Tab to switch words and Escape to exit.
Its `/start` native date-input focus check also has an explicit `fixme` condition. These are visible limitations,
not passing results. The sweep has regression checks for the focus detector itself.

A test file documents an intended check. Consult the actual run results, skipped/fixme tests and browser projects
before reporting a pass. Browser tests require installed Playwright browsers. This documentation change did not
run a new browser audit or manual screen-reader review.
