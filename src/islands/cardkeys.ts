/**
 * Pure key-to-action mapping for the flashcard keyboard interface.
 * Uses a subset of KeyboardEvent so it can be tested without a browser.
 */
export type CardKeyAction = 'flip' | 'back' | 'advance' | 'know' | 'learning' | 'star';

export interface CardKeyEvent {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** The event target — accepts real EventTarget or test stubs alike. */
  target?: { tagName?: string; isContentEditable?: boolean } | EventTarget | null;
}

/**
 * Maps a keyboard event to a CardKeyAction.
 * Returns null when the key should not trigger an action — either an
 * unrecognised key, a modifier-combo, or focus is inside a text field.
 */
export function cardKeyAction(event: CardKeyEvent): CardKeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;

  const t = event.target;
  const tag = t != null && typeof (t as { tagName?: unknown }).tagName === 'string'
    ? (t as { tagName: string }).tagName
    : undefined;
  const editable = t != null && (t as { isContentEditable?: unknown }).isContentEditable === true;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
  if (editable) return null;

  switch (event.key) {
    case ' ':
      return 'flip';
    case 'ArrowLeft':
      return 'back';
    case 'ArrowRight':
      return 'advance';
    case '1':
      return 'know';
    case '2':
      return 'learning';
    case 's':
    case 'S':
      return 'star';
    default:
      return null;
  }
}
