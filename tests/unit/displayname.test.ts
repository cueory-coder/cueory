import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDisplayName, INVISIBLE } from '../../src/islands/displayname';

const INVISIBLE_MESSAGE = 'a name cannot contain invisible or text-direction characters.';
/** Every code point display_name_ok refuses as invisible or direction-changing (Task 302). */
const REFUSED = [0x061c, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff];

describe('checkDisplayName', () => {
  it('accepts a plain ASCII name', () => {
    expect(checkDisplayName('Alex')).toEqual({ ok: true, name: 'Alex' });
  });

  it('trims leading and trailing spaces', () => {
    expect(checkDisplayName('  Alex  ')).toEqual({ ok: true, name: 'Alex' });
  });

  it('accepts a name with an accented letter', () => {
    expect(checkDisplayName('José')).toEqual({ ok: true, name: 'José' });
  });

  it('accepts exactly 50 code points (BMP)', () => {
    const name = 'a'.repeat(50);
    expect(checkDisplayName(name)).toEqual({ ok: true, name });
  });

  it('accepts exactly 50 code points with accented letters', () => {
    const name = 'é'.repeat(50); // é is U+00E9, one code point each
    expect(checkDisplayName(name)).toEqual({ ok: true, name });
  });

  it('accepts exactly 50 code points with emoji (supplementary characters)', () => {
    // Each emoji is one Unicode code point but two UTF-16 code units; [...str].length counts correctly
    const name = '😀'.repeat(50);
    expect(checkDisplayName(name)).toEqual({ ok: true, name });
  });

  it('rejects 51 code points (BMP)', () => {
    expect(checkDisplayName('a'.repeat(51))).toEqual({ ok: false, message: 'a name can be 1 to 50 characters.' });
  });

  it('rejects 51 code points with emoji', () => {
    expect(checkDisplayName('😀'.repeat(51))).toEqual({ ok: false, message: 'a name can be 1 to 50 characters.' });
  });

  it('rejects an empty string', () => {
    expect(checkDisplayName('')).toEqual({ ok: false, message: 'a name is required.' });
  });

  it('rejects a string of spaces only', () => {
    expect(checkDisplayName('   ')).toEqual({ ok: false, message: 'a name is required.' });
  });

  it('rejects a name containing a tab (control character U+0009)', () => {
    expect(checkDisplayName('Alex\tSmith')).toEqual({ ok: false, message: 'a name cannot contain control characters.' });
  });

  it('rejects a name containing a newline (control character U+000A)', () => {
    expect(checkDisplayName('Alex\nSmith')).toEqual({ ok: false, message: 'a name cannot contain control characters.' });
  });

  it('rejects a name containing U+007F (DEL)', () => {
    expect(checkDisplayName('Alex\u007fSmith')).toEqual({ ok: false, message: 'a name cannot contain control characters.' });
  });

  it('rejects a name containing a C1 control character (U+0085 NEL)', () => {
    expect(checkDisplayName('Alex\u0085Smith')).toEqual({ ok: false, message: 'a name cannot contain control characters.' });
  });

  it('rejects a non-string input', () => {
    expect(checkDisplayName(null)).toEqual({ ok: false, message: 'a name is required.' });
    expect(checkDisplayName(42)).toEqual({ ok: false, message: 'a name is required.' });
    expect(checkDisplayName(undefined)).toEqual({ ok: false, message: 'a name is required.' });
  });

  it('accepts a 50-code-point name that is at the boundary after trimming', () => {
    const name = 'a'.repeat(50);
    expect(checkDisplayName(`  ${name}  `)).toEqual({ ok: true, name });
  });

  it('rejects a 51-code-point name that is at the boundary after trimming', () => {
    expect(checkDisplayName(`  ${'a'.repeat(51)}  `)).toEqual({ ok: false, message: 'a name can be 1 to 50 characters.' });
  });

  it.each(REFUSED.map((code) => [code.toString(16).padStart(4, '0'), code]))(
    'rejects a name containing U+%s (invisible or direction-changing)', (_hex, code) => {
      expect(checkDisplayName(`sam${String.fromCodePoint(code as number)}smith`)).toEqual({ ok: false, message: INVISIBLE_MESSAGE });
    },
  );

  it('rejects a right-to-left override used to disguise a name', () => {
    expect(checkDisplayName('sam\u202enimda')).toEqual({ ok: false, message: INVISIBLE_MESSAGE });
  });

  it('rejects a name that is only a zero-width space', () => {
    expect(checkDisplayName('\u200b')).toEqual({ ok: false, message: INVISIBLE_MESSAGE });
  });

  it('accepts right-to-left letters and neighbouring characters outside the refused ranges', () => {
    expect(checkDisplayName('محمد')).toEqual({ ok: true, name: 'محمد' });
    expect(checkDisplayName('sam\u2065smith')).toEqual({ ok: true, name: 'sam\u2065smith' });
    expect(checkDisplayName('sam \u201cthe nurse\u201d')).toEqual({ ok: true, name: 'sam \u201cthe nurse\u201d' });
  });
});

describe('the browser and the database refuse the same characters', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20261102160000_fresh_sign_in_and_name_rules.sql', import.meta.url), 'utf8');

  it('INVISIBLE is the same character class as display_name_ok', () => {
    const classes = [...migration.matchAll(/name !~ '(\[[^']*\])'/g)].map((match) => match[1]);
    expect(classes).toContain(INVISIBLE.source);
  });

  it('display_name_ok also names the control ranges the browser refuses', () => {
    expect(migration).toContain("name !~ '[\\x01-\\x1f\\x7f-\\x9f]'");
    expect(migration).toContain('char_length(name) between 1 and 50');
  });
});

