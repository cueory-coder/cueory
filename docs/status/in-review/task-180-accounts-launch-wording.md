STATUS: READY_FOR_REVIEW — W01 Task 180 adds a default-false accountsOpen wording switch. When open, account creation goes to /signup, sign-in goes to /signin, coming-soon notes disappear, and the promo uses the already-planned create-your-free-account label. Authentication availability and access control are unchanged.

Scope recorded before editing: src/config/site.ts, src/components/AccountCorner.astro, src/scripts/accountcorner.ts, tests/unit/accountcorner.test.ts, tests/unit/accountlaunch.test.ts, tests/e2e/account-launch.spec.ts, and this status note. The existing accountcorner unit file needed no edits. PromoPanel already reads the shared configuration, so no fourth production file needed changes.

Validation: npm run check passed with 0 errors and 11 existing hints. npm run build passed. npm test passed all 109 files and 3,302 tests. git diff --check passed. The new Playwright spec was attempted in all four configured Chromium projects, but none ran because Chromium is absent. The standard browser installer returned an invalid/truncated download. Browser checks remain for CI.

Needs Christian's approval: account wording and links. This does not open accounts or change authentication code.
