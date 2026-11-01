/** Pure checks for glove-note ideas. Christian reviews the wording separately. */
export const MAX_IDEA_CHARACTERS = 60;

export interface BreakIdea {
  id: string;
  text: string;
}

export type SharedIdeaCheck = { ok: true; text: string } | { ok: false; message: string };

// Keep ordinary emoji (including joiners), but refuse controls and directional overrides.
const hiddenControls = /[\p{Cc}\p{Zl}\p{Zp}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const linkOrAddress = /(?:\b(?:https?|ftp|file|data|javascript|mailto|tel):|\/\/|www\.|@|(?:[\p{L}\p{N}][\p{L}\p{N}-]*\.)+(?:[\p{L}]{2,63}|xn--[\p{L}\p{N}-]{2,59})(?=$|[^\p{L}\p{N}-])|\b(?:\d{1,3}\.){3}\d{1,3}\b|\blocalhost(?::\d+|\/)|\[[^\]]*\]\s*\(|<a\b)/iu;

/** The later signed-in share form uses these same text checks; this does not approve content. */
export function checkSharedIdea(value: unknown): SharedIdeaCheck {
  if (typeof value !== 'string') return { ok: false, message: 'write your idea as text.' };
  if (hiddenControls.test(value)) {
    return { ok: false, message: 'use plain text without control or direction-changing characters.' };
  }
  const text = value.trim();
  const length = Array.from(text).length;
  if (length < 1 || length > MAX_IDEA_CHARACTERS) {
    return { ok: false, message: `keep your idea between 1 and ${MAX_IDEA_CHARACTERS} characters.` };
  }
  // Normalize only for detection; preserve the writer's accepted text and emoji.
  const addressText = text.normalize('NFKC').replace(/[\u3002\uff0e\uff61]/gu, '.');
  if (linkOrAddress.test(addressText)) {
    return { ok: false, message: 'leave out links, web addresses and email addresses.' };
  }
  return { ok: true, text };
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Read the director's JSON shape, rejecting unknown fields and returning fresh objects. */
export function parseIdeas(data: unknown): BreakIdea[] {
  if (!exactRecord(data, ['ideas']) || !Array.isArray(data.ideas)) {
    throw new Error('break ideas need an object containing only an ideas list.');
  }
  const seen = new Set<string>();
  return Array.from(data.ideas, (entry: unknown, index) => {
    const name = `break idea ${index + 1}`;
    if (!exactRecord(entry, ['id', 'text'])) throw new Error(`${name} needs only an id and text.`);
    if (typeof entry.id !== 'string' || entry.id.length > 40 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id)) {
      throw new Error(`${name} needs a short lowercase id, using letters, numbers and single hyphens.`);
    }
    if (seen.has(entry.id)) throw new Error(`${name} repeats an earlier id.`);
    const checked = checkSharedIdea(entry.text);
    if (!checked.ok) throw new Error(`${name}: ${checked.message}`);
    seen.add(entry.id);
    return { id: entry.id, text: checked.text };
  });
}

/** Shuffle a copy, excluding the last idea when there is a choice. One idea can still be shown. */
export function pickIdea(
  ideas: readonly BreakIdea[], lastId: string | null | undefined, random: () => number,
): BreakIdea | null {
  const choices = ideas.length > 1 ? ideas.filter(idea => idea.id !== lastId) : [...ideas];
  for (let i = choices.length - 1; i > 0; i--) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('random must return a number from 0 up to 1.');
    const j = Math.floor(draw * (i + 1));
    [choices[i], choices[j]] = [choices[j]!, choices[i]!];
  }
  const picked = choices[0];
  return picked ? { ...picked } : null;
}
