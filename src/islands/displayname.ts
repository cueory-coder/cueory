/**
 * Display-name validation for the browser (ROADMAP Task 2, D-77).
 * Mirrors the database rules exactly so a student hears about a bad name before it is saved.
 *
 * Rules come from public.display_name_ok in supabase/migrations/20261102160000_fresh_sign_in_and_name_rules.sql, the
 * one check the sign-up trigger (and the profile page's update_display_name) use:
 *   1 to 50 characters (char_length), after trimming surrounding spaces;
 *   no control characters: U+0001–U+001F and U+007F–U+009F (and [[:cntrl:]]);
 *   no invisible or direction-changing characters: U+061C, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064,
 *   U+2066–U+2069 and U+FEFF.
 *
 * char_length in PostgreSQL counts Unicode code points (not bytes, not UTF-16 code units).
 * JavaScript's [...str].length does the same for BMP and supplementary characters alike.
 */

/** The invisible and direction-changing characters display_name_ok refuses, the same ranges exactly. */
export const INVISIBLE = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

export type DisplayNameResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

/**
 * Trims leading and trailing spaces, then checks the trimmed value against
 * display_name_ok's rules. Returns the cleaned name on success, or a plain
 * lowercase message on failure.
 */
export function checkDisplayName(input: unknown): DisplayNameResult {
  if (typeof input !== 'string') return { ok: false, message: 'a name is required.' };
  const name = input.replace(/^ +| +$/g, '');
  // No control characters (U+0000–U+001F, U+007F–U+009F).
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) {
    return { ok: false, message: 'a name cannot contain control characters.' };
  }
  // No invisible or direction-changing characters: they can hide text or make a name look like someone else's.
  if (INVISIBLE.test(name)) {
    return { ok: false, message: 'a name cannot contain invisible or text-direction characters.' };
  }
  // profiles_display_name_length: 1 to 50 code points
  const codePoints = [...name].length;
  if (codePoints === 0) return { ok: false, message: 'a name is required.' };
  if (codePoints > 50) return { ok: false, message: 'a name can be 1 to 50 characters.' };
  return { ok: true, name };
}
