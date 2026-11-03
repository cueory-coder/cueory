STATUS: study routes now load a dedicated token-based print stylesheet that hides site chrome while preserving the lesson main content; the print-media e2e check covers every lesson route.

Round 1: addressed Codex review finding. Added print-only full-text lesson rendering and print stylesheet declarations (`[data-print-only]`, `[data-print-hidden]`) so all sentences are readable in print media before any interactive stepping. E2E tests assert all lesson sentences are visible in print media and hidden in screen media.
