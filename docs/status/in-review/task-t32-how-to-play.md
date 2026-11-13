# T32: how to play dialogs

Stacked on T20 !123 (98304737a3bb23c503d42e09f91158d7efc975fa), transitively !109. Target: staging. Keep Draft until parent integration and exact-head verification.

All six games use a native modal with a keyboard/tap help trigger, labeled heading, close button, Escape dismissal and focus return. Rules come from existing game instructions and controls. No storage, account, content answers or clinical facts added. Stat's timer continues while help is open, stated in its rules.

Validation requires npm run check, npm run build, the complete Vitest suite, and six-profile Chromium help/game regressions. The MR's exact-head verification note records the completed results and strict review; this note alone does not mark the task Ready. Browser coverage includes keyboard and tap, focus, 44 px controls, reduced motion, axe and enlarged text on /play, /play/stat and /play/hello-cards, in Light and Evening at phone, tablet and desktop sizes.

WebKit/Firefox are not installed in the reused browser runtime. Parent integration and Christian decisions remain unchanged. No merge or formal approval by C5.
