/** Pure keyboard intent for the timed stat game. DOM focus and overlay state are supplied by the island. */
export interface StatKeyContext {
  key: string;
  hasModifier: boolean;
  isRepeated: boolean;
  isEditing: boolean;
  focusInsideOverlay: boolean;
  overlayOpen: boolean;
  onActionControl: boolean;
}

export type StatKeyAction =
  | { kind: 'pick'; letter: 'a' | 'b' | 'c' | 'd' }
  | { kind: 'next' }
  | null;

/** Never take game keys while a menu, search control or dialog owns the keyboard. */
export function statKeyAction(context: StatKeyContext): StatKeyAction {
  if (
    context.hasModifier || context.isRepeated || context.isEditing ||
    context.focusInsideOverlay || context.overlayOpen
  ) return null;
  const letter = context.key.toLowerCase();
  if (letter === 'a' || letter === 'b' || letter === 'c' || letter === 'd') {
    return { kind: 'pick', letter };
  }
  // Buttons and links already get Enter natively. Don't advance the game as well.
  if (context.key === 'Enter' && !context.onActionControl) return { kind: 'next' };
  return null;
}
