import { describe, expect, it } from 'vitest';
import { checkDisplayName } from '../../src/islands/displayname';

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
});
