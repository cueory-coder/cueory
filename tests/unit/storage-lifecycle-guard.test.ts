/** T15 baseline regression: do not waive a discovered key's lifecycle coverage. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { afterDeletion } from '../../src/islands/deleteaccount';
import { SUDOKU_SETTINGS_KEY } from '../../src/islands/sudoku';

describe('discovered Sudoku settings lifecycle coverage (T15)', () => {
  it('includes the saved settings key in account deletion', () => {
    const storage = {
      length: 1,
      key: (index: number) => index === 0 ? SUDOKU_SETTINGS_KEY : null,
      getItem: (_key: string) => null,
      setItem: (_key: string, _value: string) => {},
      removeItem: (_key: string) => {},
    };
    expect([...afterDeletion(storage)]).toContain(SUDOKU_SETTINGS_KEY);
  });

  it('discloses the settings key on the privacy page', () => {
    const privacy = readFileSync(new URL('../../src/pages/privacy.astro', import.meta.url), 'utf8');
    expect(privacy).toContain(SUDOKU_SETTINGS_KEY);
  });
});
