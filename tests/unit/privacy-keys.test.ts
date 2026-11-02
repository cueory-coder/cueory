/**
 * This test checks the built /privacy page. npm run verify builds before unit tests.
 * Keys from unfinished features are disclosed now, without saying those features are live.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import { VISIT_STORAGE_KEY, LAST_WELCOME_STORAGE_KEY } from '../../src/islands/stickynote';
import { NOTE_SOUND_STORAGE_KEY } from '../../src/scripts/notesound';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { PROMO_STORAGE_KEY } from '../../src/scripts/promo';
import { RESUME_STORAGE_KEY } from '../../src/scripts/resume';

const privacyPath = fileURLToPath(new URL('../../dist/privacy.html', import.meta.url));

function privacyHtml(): string {
  return readFileSync(privacyPath, 'utf8');
}

/** Only look at visible <code> elements, not incidental text in bundled scripts. */
function visibleCodeKeys(html: string): string[] {
  return [...html.matchAll(/<code(?:\s[^>]*)?>([^<]*)<\/code>/g)].map((match) =>
    match[1]!.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'),
  );
}

describe.skipIf(!existsSync(privacyPath))('privacy page browser storage disclosures', () => {
  it.each([
    PROGRESS_STORAGE_KEY,
    VISIT_STORAGE_KEY,
    LAST_WELCOME_STORAGE_KEY,
    NOTE_SOUND_STORAGE_KEY,
    THEME_STORAGE_KEY,
    PROMO_STORAGE_KEY,
    RESUME_STORAGE_KEY,
  ])('includes the exported browser key %s in built markup', (key) => {
    expect(visibleCodeKeys(privacyHtml())).toContain(key);
  });

  // TODO(Task 55): import the auth key once that client has merged into staging.
  // TODO(Task 62): import the guest-import key builder after Task 62 merges.
  // TODO(Task 76): import the break-timer key after Task 76 merges.
  it.each(['cueory-auth', 'cueory-guest-imported:<id>', 'cueory-break-timer'])(
    'discloses the planned storage key %s',
    (key) => {
      expect(visibleCodeKeys(privacyHtml())).toContain(key);
    },
  );

  it.each([
    VISIT_STORAGE_KEY,
    LAST_WELCOME_STORAGE_KEY,
    NOTE_SOUND_STORAGE_KEY,
    'cueory-break-timer',
  ])('labels the unfinished feature %s as conditional, in its own list item', (key) => {
    const listItems = privacyHtml().match(/<li(?:\s[^>]*)?>[\s\S]*?<\/li>/g) ?? [];
    const item = listItems.find((part) => part.includes('<code>' + key + '</code>'));
    expect(item, 'missing list item for ' + key).toBeDefined();
    expect(item).toContain('when this feature is on');
  });

  it('does not imply sign-in, export or deletion for accounts is live', () => {
    const html = privacyHtml();
    expect(html).toContain('Accounts are not open yet.');
    expect(html).toContain('not available yet');
    expect(html).toContain('Google sign-in');
    expect(html).toContain('<code>/account</code>');
    expect(html).toContain('download your account data');
    expect(html).toContain('request deletion of your account');
  });
});
