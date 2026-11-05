/** Combined staging regression after PRs #601 and #607.
 *
 * A test-source change intentionally forces the real CI to run the browser
 * shards (rather than taking the docs-only shortcut for a status-only PR).
 * The assertions are limited to existing public invariants.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHeldPath } from '../../scripts/automerge/decide.ts';
import { indexablePages } from '../../src/config/routes.ts';

describe('integrated staging after legal and security merges', () => {
  it('keeps unfinished legal pages excluded from the public sitemap', () => {
    for (const page of ['/privacy', '/terms', '/disclaimer']) {
      expect(indexablePages).not.toContain(page);
    }
    expect(indexablePages).toContain('/support');
  });

  it('requires founder review for current auth and account source in both modes', () => {
    const sensitive = [
      'src/pages/auth/callback.astro',
      'src/pages/admin/flags.astro',
      'src/pages/account/two-factor.astro',
      'src/islands/supabaseclient.ts',
      'src/islands/ReviewSession.tsx',
      'src/islands/adminflagsrpc.ts',
      'src/islands/flagitem.ts',
      'src/islands/checkanswer.ts',
      'src/islands/examplansync.ts',
      'src/islands/reviewsync.ts',
      'src/islands/studyrecorder.ts',
    ];
    for (const mode of ['prelaunch', 'launched'] as const) {
      for (const file of sensitive) expect(isHeldPath(file, mode), file).toBe(true);
      // Anatomy build-time draft selection now requires founder approval.
      expect(isHeldPath('src/islands/anatomylab.ts', mode)).toBe(true);
      // Unrelated study UI stays eligible for the ordinary review path.
      expect(isHeldPath('src/islands/cards.ts', mode)).toBe(false);
    }
  });

  it('does not disable the full-history secret scan or main browser-engine gate', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('./gitleaks git --redact --no-banner --exit-code 1');
    expect(workflow).toContain('needs: [checks, browser, engines]');
    expect(workflow).toContain('if [ "$MAIN_RELEASE_PR" = "true" ] && [ "$ENGINES" != "success" ]; then');
  });
});
