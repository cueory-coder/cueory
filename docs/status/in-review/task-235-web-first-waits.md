STATUS: Task 235 (W38) replaces three fixed carousel waits with polling for completed card transitions or the expected computed scale, preserving every existing assertion. No application behavior changes.

Validation: check passed (0 errors, 0 warnings), build passed, all 3,547 unit tests passed. The three changed desktop browser cases were selected, but execution stopped before assertions because Chromium headless shell build 1248 is missing. CI browser verification is still required.
