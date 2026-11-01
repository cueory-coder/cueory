/**
 * Display-name validation for the browser (ROADMAP Task 2, D-77).
 * Mirrors the database rules exactly so a student hears about a bad name before it is saved.
 *
 * Rules come from supabase/migrations/20261101060100_profiles.sql:
 *   profiles_display_name_length:   char_length(display_name) between 1 and 50
 *   profiles_display_name_printable: display_name !~ '[[:cntrl:]]'
 *
 * char_length in PostgreSQL counts Unicode code points (not bytes, not UTF-16 code units).
 * JavaScript's [...str].length does the same for BMP and supplementary characters alike.
 */

export type DisplayNameResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

/**
 * Trims leading and trailing spaces, then checks the trimmed value against the
 * two database constraints. Returns the cleaned name on success, or a plain
 * lowercase message on failure.
 */
export function checkDisplayName(input: unknown): DisplayNameResult {
  if (typeof input !== 'string') return { ok: false, message: 'a name is required.' };
  const name = input.replace(/^ +| +$/g, '');
  // profiles_display_name_printable: no control characters (U+0000–U+001F, U+007F–U+009F and others in [[:cntrl:]])
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) {
    return { ok: false, message: 'a name cannot contain control characters.' };
  }
  // profiles_display_name_length: 1 to 50 code points
  const codePoints = [...name].length;
  if (codePoints === 0) return { ok: false, message: 'a name is required.' };
  if (codePoints > 50) return { ok: false, message: 'a name can be 1 to 50 characters.' };
  return { ok: true, name };
}
