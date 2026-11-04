/**
 * This test checks the built /privacy page. npm run verify builds before unit tests.
 * Keys from unfinished features are disclosed now, without saying those features are live.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { legacyStarsKey, PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import { BREAK_STORAGE_KEY } from '../../src/scripts/breakstore';
import {
  AUTH_STORAGE_KEY, PKCE_FLOW_LIST_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY, pkceFlowStorageKey,
} from '../../src/islands/supabaseclient';
import { GUEST_IMPORT_MARKER_PREFIX } from '../../src/islands/guestimportrun';
import { STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { afterDeletion } from '../../src/islands/deleteaccount';
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
    STATS_STORAGE_KEY,
    legacyStarsKey('<deck>'),
  ])('includes the exported browser key %s in built markup', (key) => {
    expect(visibleCodeKeys(privacyHtml())).toContain(key);
  });

  it.each([
    AUTH_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY, PKCE_FLOW_LIST_STORAGE_KEY, pkceFlowStorageKey('<id>'),
    `${GUEST_IMPORT_MARKER_PREFIX}<id>`, BREAK_STORAGE_KEY,
  ])(
    'discloses the planned storage key %s',
    (key) => {
      expect(visibleCodeKeys(privacyHtml())).toContain(key);
    },
  );

  it.each([
    VISIT_STORAGE_KEY,
    LAST_WELCOME_STORAGE_KEY,
    NOTE_SOUND_STORAGE_KEY,
    BREAK_STORAGE_KEY,
  ])('labels the unfinished feature %s as conditional, in its own list item', (key) => {
    const listItems = privacyHtml().match(/<li(?:\s[^>]*)?>[\s\S]*?<\/li>/g) ?? [];
    const item = listItems.find((part) => part.includes('<code>' + key + '</code>'));
    expect(item, 'missing list item for ' + key).toBeDefined();
    expect(item).toContain('when this feature is on');
  });

  it('discloses legacy stars and says account deletion also clears local settings', () => {
    const html = privacyHtml();
    expect(visibleCodeKeys(html)).toContain(legacyStarsKey('<deck>'));
    expect(html).toContain('until they are moved into');
    expect(html).toContain('Deleting it removes your account and all study data linked to it, and clears Cueory progress and');
  });

  it('covers every named Cueory browser key with local cleanup, session cleanup or Task 59 sign-out', () => {
    const legacy = legacyStarsKey('<deck>');
    const imported = `${GUEST_IMPORT_MARKER_PREFIX}<id>`;
    const examples = [legacy, imported, pkceFlowStorageKey('<id>')];
    const storage = {
      length: examples.length,
      key: (index: number) => examples[index] ?? null,
      getItem: (_key: string) => null,
      setItem: (_key: string, _value: string) => {},
      removeItem: (_key: string) => {},
    };
    const plan = afterDeletion(storage);
    const covered = new Set([...plan, ...plan.sessionKeys, AUTH_STORAGE_KEY]);
    const disclosed = visibleCodeKeys(privacyHtml()).filter((key) => key.startsWith('cueory-'));
    expect(new Set(disclosed).size).toBeGreaterThanOrEqual(15);
    for (const key of disclosed) {
      expect(covered.has(key), `no deletion or sign-out path for ${key}`).toBe(true);
    }
    expect(plan).not.toContain(AUTH_STORAGE_KEY);
  });

  it('lists study resume as in use now, in the "It is only:" list, and words its answers truthfully', () => {
    const html = privacyHtml();
    const [inUse, building] = html.split('Features that are still being built');
    expect(building, 'missing the still-being-built section').toBeDefined();
    expect(inUse).toContain(`<code>${RESUME_STORAGE_KEY}</code>`);
    expect(building).not.toContain(RESUME_STORAGE_KEY);
    const only = inUse!.slice(inUse!.indexOf('It is only:'));
    const list = only.slice(0, only.indexOf('</ul>'));
    expect(list).toContain('where you stopped in a study activity');
    expect(html).toContain('It never holds the answer key, but it can hold');
    expect(html).toContain('answers you got right');
    expect(html).not.toContain('never holds correct answers');
  });

  it('stays true whether or not accounts are switched on in the build', () => {
    const html = privacyHtml();
    for (const stale of ['no accounts yet', 'Accounts are not open yet', 'When accounts arrive', 'Until accounts exist',
      'When accounts open', 'Once accounts are on']) {
      expect(html, stale).not.toContain(stale);
    }
    expect(html).toContain('When you create one, we store only:');
  });

  it('names flag reports, what Google sign-in shares and that the launch list is separate', () => {
    const html = privacyHtml();
    expect(html).toContain('Reports you send with the "Flag or comment" button');
    expect(html).toContain('the reason you picked and your comment');
    expect(html).toContain('until your');
    expect(html).toContain('account is deleted');
    expect(html).toContain('Supabase keeps them with');
    expect(html).toContain('such as its email address, name and profile-picture link,');
    expect(html).toContain('deleting an account doesn\'t take you off it');
    expect(html).toContain('unsubscribe link');
    expect(html).toContain('Signing out removes them.');
  });

  it('describes the /account page (Task 59) under "If you create an account", so it is true with accounts on or off', () => {
    const html = privacyHtml();
    const account = html.slice(html.indexOf('If you create an account'));
    expect(account).toContain('<code>/account</code>');
    expect(account).toContain('download your account data');
    expect(account).toContain('delete your');
    expect(html).not.toContain('not available yet');
    expect(html).toContain('Google sign-in');
  });

  it('says progress stays on the device unless brought in, and what a signed-in student saves to the account', () => {
    const html = privacyHtml();
    expect(html).not.toContain('It never reaches us. It is only:');
    expect(html).toContain('Without an account, nothing you do on a');
    expect(html).toContain('Unless you choose to bring it into your account, your study progress is kept by your browser');
    expect(html).toContain('your work on real questions is also saved to your account');
    expect(html).toContain('stars stay on this device');
  });
});
