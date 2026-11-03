STATUS: study routes now load a dedicated token-based print stylesheet that hides site chrome while preserving the lesson main content; the print-media e2e check covers every lesson route.

Round 1: addressed Codex review finding. Added print-only full-text lesson rendering and print stylesheet declarations (`[data-print-only]`, `[data-print-hidden]`) so all sentences are readable in print media before any interactive stepping. E2E tests assert all lesson sentences are visible in print media and hidden in screen media.

Round 2: addressed Codex review finding. Marked `<noscript>` fallback with `data-print-hidden` and added print stylesheet rule `noscript[data-print-hidden]` to ensure only a single full-text rendering appears in print media when printing with JavaScript disabled. Added E2E coverage for print media with JavaScript disabled.
