/** Pure checks for glove-note ideas. Christian reviews the wording separately. */
export const MAX_IDEA_CHARACTERS = 60;

/** The director may classify reviewed ideas. Untagged samples fit any break. */
export type BreakLength = 'short' | 'long';
export type BreakLengthChoice = BreakLength | 'any';

export interface BreakIdea {
  id: string;
  text: string;
  length?: BreakLength;
}

export type SharedIdeaCheck = { ok: true; text: string } | { ok: false; message: string };

// Only supported emoji sequences may use a format-character joiner.
const hiddenControls = /[\p{Cc}\p{Zl}\p{Zp}]|(?!\u200d)\p{Cf}/u;
const linkOrAddress = /(?:\b(?:https?|ftp|file|data|javascript|mailto|tel):|\/\/|www\.|@|(?:[\p{L}\p{N}\p{Extended_Pictographic}][\p{L}\p{N}\p{M}\p{Extended_Pictographic}-]*\.)+(?:\p{L}[\p{L}\p{M}]{1,62}|xn--[\p{L}\p{N}-]{2,59})(?=$|[^\p{L}\p{N}\p{M}-])|\b(?:\d{1,3}\.){3}\d{1,3}\b|\blocalhost(?::\d+|\/)|\[[^\]]*\]\s*\(|<a\b)/iu;

function supportedJoiners(text: string): boolean {
  for (let index = text.indexOf('\u200d'); index >= 0; index = text.indexOf('\u200d', index + 1)) {
    if (!/\p{Extended_Pictographic}[\p{Emoji_Modifier}\uFE0F]*$/u.test(text.slice(0, index))
      || !/^\p{Extended_Pictographic}/u.test(text.slice(index + 1))) return false;
  }
  return true;
}

/**
 * URL parsing also catches IDNA/emoji labels and escaped hostnames that a character-class check can miss.
 * This only parses text; it never requests an address. WHATWG host conversion:
 * https://nodejs.org/api/url.html#new-urlinput-base
 */
function hasBrowserAddress(text: string): boolean {
  return text.split(/[\s<>(){},;"'!?\u2018\u2019\u201c\u201d]+/u).some(token => {
    let candidate = token.replace(/^[*_]+|[*_]+$/gu, '');
    // Keep brackets for IPv6; other brackets can be ordinary prose around a domain.
    if (!/^\[[\da-f:.]+\]/iu.test(candidate)) candidate = candidate.replace(/^[\[]+|[\]]+$/gu, '');
    try {
      const hostname = new URL(`https://${candidate}`).hostname.replace(/\.$/u, '');
      if (/^\[[\da-f:]+\]$/iu.test(hostname)) return true;
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(hostname)) {
        // URL also treats a plain number or decimal as an abbreviated IP; ordinary numbers are allowed in ideas.
        const writtenHost = candidate.split('/')[0]!;
        return writtenHost.includes('%') || writtenHost.split('.').length >= 4 || /^0x[\da-f]+$/iu.test(writtenHost);
      }
      const labels = hostname.split('.');
      return labels.length > 1
        && labels.every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/iu.test(label))
        && /^(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/iu.test(labels.at(-1)!);
    } catch {
      return false;
    }
  });
}

/** The later signed-in share form uses these same text checks; this does not approve content. */
export function checkSharedIdea(value: unknown): SharedIdeaCheck {
  if (typeof value !== 'string') return { ok: false, message: 'write your idea as text.' };
  if (hiddenControls.test(value) || !supportedJoiners(value)) {
    return { ok: false, message: 'use plain text without control or direction-changing characters.' };
  }
  const text = value.trim();
  const length = Array.from(text).length;
  if (length < 1 || length > MAX_IDEA_CHARACTERS) {
    return { ok: false, message: `keep your idea between 1 and ${MAX_IDEA_CHARACTERS} characters.` };
  }
  if (!text.replace(/[\p{Default_Ignorable_Code_Point}\p{M}\p{Z}]/gu, '')) {
    return { ok: false, message: 'write an idea with visible text or emoji.' };
  }
  // Normalize only for detection; preserve the writer's accepted text and emoji.
  const addressText = text.normalize('NFKC')
    .replace(/\p{Default_Ignorable_Code_Point}/gu, '').replace(/[\u3002\uff0e\uff61]/gu, '.');
  if (linkOrAddress.test(addressText) || hasBrowserAddress(addressText)) {
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
    if (!exactRecord(entry, ['id', 'text']) && !exactRecord(entry, ['id', 'text', 'length'])) {
      throw new Error(`${name} needs an id, text and optional length only.`);
    }
    if (Object.hasOwn(entry, 'length') && entry.length !== 'short' && entry.length !== 'long') {
      throw new Error(`${name} needs a short or long length when classified.`);
    }
    if (typeof entry.id !== 'string' || entry.id.length > 40 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id)) {
      throw new Error(`${name} needs a short lowercase id, using letters, numbers and single hyphens.`);
    }
    if (seen.has(entry.id)) throw new Error(`${name} repeats an earlier id.`);
    const checked = checkSharedIdea(entry.text);
    if (!checked.ok) throw new Error(`${name}: ${checked.message}`);
    seen.add(entry.id);
    return {
      id: entry.id, text: checked.text,
      ...(entry.length === 'short' || entry.length === 'long' ? { length: entry.length } : {}),
    };
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

/** Return eligible reviewed ideas in the original order, without changing the input. */
export function ideasForLength(ideas: readonly BreakIdea[], length: BreakLengthChoice): BreakIdea[] {
  return ideas.filter(idea => length === 'any' || idea.length === undefined || idea.length === length);
}

/** Seeded by the caller for tests. Avoid an immediate repeat whenever more than one choice exists. */
export function pickIdeaForLength(
  ideas: readonly BreakIdea[], length: BreakLengthChoice, lastId: string | null | undefined, random: () => number,
): BreakIdea | null {
  return pickIdea(ideasForLength(ideas, length), lastId, random);
}
