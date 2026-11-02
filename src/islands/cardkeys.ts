/**
 * Pure key-to-action mapping for the flashcard keyboard shortcuts (Task 78).
 * Uses a subset of KeyboardEvent so it can be tested without a browser.
 *
 *   Space → flip   ← → back   → → advance   1 → know it   2 → still learning   S → star
 */
export type CardKeyAction = 'flip' | 'back' | 'advance' | 'know' | 'learning' | 'star';

export interface CardKeyEvent {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /** True while a key is held down and the browser repeats it. */
  repeat?: boolean;
  /** The event target — accepts real EventTarget or test stubs alike. */
  target?: { tagName?: string; isContentEditable?: boolean } | EventTarget | null;
}

/** Fields where every key belongs to typing (or to the field's own arrow-key behavior). */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Controls that Space already activates. Taking Space from them would break the control (Codex on #162). */
const SPACE_ACTIVATED_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);

function targetTag(event: CardKeyEvent): string | undefined {
  const t = event.target as { tagName?: unknown } | null | undefined;
  return t != null && typeof t.tagName === 'string' ? t.tagName.toUpperCase() : undefined;
}

/**
 * Maps a keyboard event to a CardKeyAction.
 * Returns null when the key should not trigger an action: an unrecognised key, a modifier combination, a held-down
 * repeat, focus inside a text field, or Space on a button or link (which Space already presses).
 */
export function cardKeyAction(event: CardKeyEvent): CardKeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.repeat) return null;

  const tag = targetTag(event);
  const editable = (event.target as { isContentEditable?: unknown } | null | undefined)?.isContentEditable === true;
  if ((tag !== undefined && TYPING_TAGS.has(tag)) || editable) return null;

  switch (event.key) {
    case ' ':
      return tag !== undefined && SPACE_ACTIVATED_TAGS.has(tag) ? null : 'flip';
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
