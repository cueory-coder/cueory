/** Integration smoke checks for the combined November staging merge train.
 *
 * This test lives on the integration branch rather than one of the older PR
 * heads so CI exercises the combined tree with the full browser suite.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupStructures } from '../../src/islands/anatomylab.ts';
import { validateUrl } from '../../src/islands/supabaseenv.ts';
import { selectEventPullRequest } from '../../scripts/automerge/event.ts';
import { REQUIRED_CHECKS } from '../../scripts/automerge/decide.ts';

describe('staging merge integration', () => {
  it('preserves original anatomy structure ID lookup and name lookup together', () => {
    const items = [
      { id: 'FMA7204', text: 'Left ventricle', group: 'heart' },
      { id: 'FMA7205', text: 'Right ventricle', group: 'heart' },
    ];
    expect(groupStructures(items, 'FMA7204').flatMap((x) => x.items.map((s) => s.id))).toEqual(['FMA7204']);
    expect(groupStructures(items, 'left vent').flatMap((x) => x.items.map((s) => s.id))).toEqual(['FMA7204']);
  });

  it('keeps the stricter local Supabase URL validation while allowing a valid local origin', () => {
    expect(validateUrl('http://localhost:54321')).toBe('http://localhost:54321');
    expect(validateUrl('http://localhost:54321/rest/v1')).toBeNull();
    expect(validateUrl('http://localhost:54321?debug=1')).toBeNull();
    expect(validateUrl('http://127.0.0.1:54321/#debug')).toBeNull();
  });

  it('keeps CI events scoped to a PR instead of scanning every open PR', () => {
    expect(selectEventPullRequest('workflow_run', { workflow_run: { pull_requests: [{ number: 599 }] } }))
      .toEqual({ kind: 'one', pr: 599 });
    expect(selectEventPullRequest('check_run', { check_run: { pull_requests: [] } }))
      .toEqual({ kind: 'none' });
    expect(selectEventPullRequest('schedule', {})).toEqual({ kind: 'sweep' });
  });

  it('retains the production legal-copy prebuild guard and CodeQL merge requirement', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.prebuild).toBe('node scripts/check-legal-release.mjs');
    expect(REQUIRED_CHECKS).toContain('CodeQL');
  });
});
