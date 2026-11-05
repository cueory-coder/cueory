import { describe, expect, it } from 'vitest';
import { moveFocus } from '../../src/scripts/search';

describe('search focus bounds', () => {
  it('recovers a stale index below the search field', () => {
    expect(moveFocus(-2, 3, 'ArrowDown')).toBe(0);
    expect(moveFocus(-2, 3, 'ArrowUp')).toBeUndefined();
  });

  it('recovers a stale index beyond the result list', () => {
    expect(moveFocus(99, 3, 'ArrowDown')).toBe(2);
    expect(moveFocus(99, 3, 'ArrowUp')).toBe(1);
  });

  it('treats an empty or invalid result count as having no destination', () => {
    expect(moveFocus(0, 0, 'ArrowDown')).toBeUndefined();
    expect(moveFocus(0, -1, 'ArrowUp')).toBeUndefined();
  });
});
