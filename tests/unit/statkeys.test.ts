import { describe, expect, it } from 'vitest';
import { statKeyAction, type StatKeyContext } from '../../src/islands/statkeys';

const normal: StatKeyContext = {
  key: 'a',
  hasModifier: false,
  isRepeated: false,
  isEditing: false,
  focusInsideOverlay: false,
  overlayOpen: false,
  onActionControl: false,
};

describe('stat keyboard shortcuts', () => {
  it.each(['a', 'b', 'c', 'd'] as const)('picks %s in normal play, including uppercase', (letter) => {
    expect(statKeyAction({ ...normal, key: letter })).toEqual({ kind: 'pick', letter });
    expect(statKeyAction({ ...normal, key: letter.toUpperCase() })).toEqual({ kind: 'pick', letter });
  });

  it('ignores letters typed into a text field, search input or contenteditable region', () => {
    expect(statKeyAction({ ...normal, isEditing: true })).toBeNull();
    expect(statKeyAction({ ...normal, key: 'Enter', isEditing: true })).toBeNull();
  });

  it('ignores keys whose focus is inside an open dialog, account menu or search results', () => {
    expect(statKeyAction({ ...normal, focusInsideOverlay: true })).toBeNull();
    expect(statKeyAction({ ...normal, key: 'Enter', focusInsideOverlay: true })).toBeNull();
  });

  it('blocks all shortcuts when a dialog or menu is open even if focus escaped it', () => {
    expect(statKeyAction({ ...normal, overlayOpen: true })).toBeNull();
    expect(statKeyAction({ ...normal, key: 'Enter', overlayOpen: true })).toBeNull();
  });

  it.each(['a', 'd', 'Enter'] as const)('ignores %s across combined overlay and editing states', (key) => {
    for (const blocked of [
      { isEditing: true },
      { focusInsideOverlay: true },
      { overlayOpen: true },
      { isEditing: true, overlayOpen: true },
    ] as const) {
      expect(statKeyAction({ ...normal, key, ...blocked })).toBeNull();
    }
  });

  it('does not capture modified or repeated keys', () => {
    expect(statKeyAction({ ...normal, hasModifier: true })).toBeNull();
    expect(statKeyAction({ ...normal, isRepeated: true })).toBeNull();
  });

  it('preserves Enter for next only when focus is not on a button or link', () => {
    expect(statKeyAction({ ...normal, key: 'Enter' })).toEqual({ kind: 'next' });
    expect(statKeyAction({ ...normal, key: 'Enter', onActionControl: true })).toBeNull();
  });

  it('does not capture unrelated keys or multi-letter strings', () => {
    for (const key of ['Escape', 'Tab', 'e', '5', 'ab', ' ', 'ArrowDown']) {
      expect(statKeyAction({ ...normal, key })).toBeNull();
    }
  });

  it('never changes its input', () => {
    const context = Object.freeze({ ...normal, key: 'D' });
    expect(statKeyAction(context)).toEqual({ kind: 'pick', letter: 'd' });
    expect(context).toEqual({ ...normal, key: 'D' });
  });
});
