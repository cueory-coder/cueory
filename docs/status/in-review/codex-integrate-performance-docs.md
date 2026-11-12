STATUS: Draft integration of canonical !24 through cba80513 with the performance-guide index entry after merged !99, preserving the content-map entry. Also reconciles the newly merged content-format guide with the current crossword schema: optional level and 3–15 grid bounds. Original branches and review gates remain intact.

Documentation follow-through: corrected the cueword paragraph in content/README.md to match the published full guide, current schema and game parser. It now states 3–15 equal-length rows of 3–15 uppercase letters/dots and the optional easy/mid/hard levels with matching 5/7/15 square sizes. Linked the full guide. No schema, game rule, scanner, budget or assertion changed. This addresses W16's contributor-guide consistency finding within the existing MR.

Focused validation of this documentation-only correction: content-format guide, docs index, crossword levels and crossword sample suites passed, 4 files / 12 tests. Compared the paragraph with src/content.config.ts and parsePuzzle()/levelSize() in src/islands/cueword.ts. No new full-project or browser pass is claimed for this two-file documentation update. Existing final-review and browser gates remain.

The ordinary rebase of !98 failed against the merged documentation index. This successor combines !24's four unchanged files with the missing README entry so a single eventual merge can keep the index and file set consistent. Neither half independently passes the exact documentation-index test.

Validation: the missing performance entry reproduced as one failing focused test. After adding only that index entry, Astro check passed with 0 errors / 0 warnings / 26 hints, build passed, Vitest passed 214 files with 5482 tests passed and 3 existing skips, and the actual performance CLI reported 44/44 built pages within budget. All four !24 source blob hashes match current head 626a59893fa775924e5efe90aadc49c316692329. Node 24.22.1 and the unchanged lockfile dependencies were used.

No browser behavior changes. Browser assertions were not run because the pinned Chromium executable is missing and installed Chromium fails before launch due to denied socket creation. No full npm run verify pass is claimed.

Draft review holds: Claude must review this combined candidate and the original !24 requested-changes state must be cleared through normal review. This successor must not be used to bypass that gate. !24 and !98 should be closed as superseded only after the approved combined successor merges. No CI, auth, database, deployment, DNS, secrets or dependency files changed.
