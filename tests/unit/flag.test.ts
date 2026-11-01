import { describe, expect, it } from 'vitest';
import { charactersLeft, checkReport, REASONS, reasonInWords, type FlagReport } from '../../src/islands/flag';

const valid: FlagReport = { page: '/learn/study-skills', itemId: 'sample_1', itemVersion: 1, reason: 'typo', comment: 'a sample note' };

describe('report fields', () => {
  it('copies a valid report, discards unknown fields and leaves input unchanged', () => {
    const input = Object.freeze({ ...valid, extra: 'leave out', nested: { other: true } });
    const result = checkReport(input);
    expect(result).toEqual({ ok: true, report: valid });
    if (result.ok) expect(result.report).not.toBe(input);
    expect(input.extra).toBe('leave out');
  });
  it('omits optional item metadata instead of serializing undefined fields', () => {
    expect(checkReport({ page: '/', reason: 'broken', comment: '' })).toEqual({ ok: true, report: { page: '/', reason: 'broken', comment: '' } });
  });
  it.each([null, undefined, [], 'text', 5])('rejects a non-report input %j', input => {
    expect(checkReport(input)).toEqual({ ok: false, problems: [{ field: 'page', message: 'the report needs this page’s address.' }] });
  });
  it.each(['/', '/a-b_c.d/2', '/A', '/' + 'a'.repeat(199)])('accepts site path %s', page => {
    expect(checkReport({ ...valid, page }).ok).toBe(true);
  });
  it.each(['', 'learn', '//elsewhere', '/a//b', '/a..b', '/../a', '/a?b', '/a#b', '/a b', '/a%20b', '/é', '/a\\b', '/' + 'a'.repeat(200), null])('rejects invalid site path %j', page => {
    expect(checkReport({ ...valid, page })).toEqual({ ok: false, problems: [{ field: 'page', message: 'use a path on this site, up to 200 characters, without a query, fragment or doubled slashes or dots.' }] });
  });
  it.each(['a', 'A-1_2', 'a'.repeat(80)])('accepts item id %s', itemId => expect(checkReport({ ...valid, itemId }).ok).toBe(true));
  it.each(['', 'a'.repeat(81), 'a.b', 'a/b', 'a b', null, 1])('rejects item id %j', itemId => {
    expect(checkReport({ ...valid, itemId })).toEqual({ ok: false, problems: [{ field: 'itemId', message: 'use an item id of 1 to 80 letters, numbers, hyphens or underscores.' }] });
  });
  it.each([1, 3, Number.MAX_SAFE_INTEGER])('accepts item version %s', itemVersion => expect(checkReport({ ...valid, itemVersion }).ok).toBe(true));
  it.each([0, -1, 1.5, NaN, Infinity, '1', null, Number.MAX_SAFE_INTEGER + 1])('rejects item version %j', itemVersion => {
    expect(checkReport({ ...valid, itemVersion })).toEqual({ ok: false, problems: [{ field: 'itemVersion', message: 'use a whole item version of 1 or more.' }] });
  });
  it('collects problems in field order with plain messages', () => {
    const result = checkReport({ page: '', itemId: '', itemVersion: 0, reason: '', comment: null });
    if (result.ok) throw new Error('expected invalid input');
    expect(result.problems.map(problem => problem.field)).toEqual(['page', 'itemId', 'itemVersion', 'reason', 'comment']);
    expect(result.problems.slice(-2)).toEqual([{ field: 'reason', message: 'choose what is wrong.' }, { field: 'comment', message: 'write the comment as text.' }]);
  });
});

describe('report reasons and comments', () => {
  it('has exactly the five stable reasons and their visible words', () => {
    expect(REASONS).toEqual(['wrong-fact', 'typo', 'confusing', 'broken', 'other']);
    expect(REASONS.map(reasonInWords)).toEqual(['a wrong fact', 'a typo', 'something confusing', 'something broken', 'something else']);
    for (const reason of REASONS) expect(checkReport({ ...valid, reason }).ok).toBe(true);
  });
  it.each(['', 'wrong', 'TYPO', null, 1])('rejects unknown reason %j', reason => {
    expect(checkReport({ ...valid, reason })).toEqual({ ok: false, problems: [{ field: 'reason', message: 'choose what is wrong.' }] });
  });
  it('normalizes line endings, removes other controls and trims without changing the input', () => {
    const input = { ...valid, comment: ' \tfirst\r\nsecond\rthird\u0000\u000b\u001f\u007f\u0085\u009f \n ' };
    expect(checkReport(input)).toEqual({ ok: true, report: { ...valid, comment: 'first\nsecond\nthird' } });
    expect(input.comment).toContain('\r');
  });
  it('keeps ordinary punctuation, Unicode and newlines', () => {
    const comment = 'a “sample” — café 😀\nnext line';
    expect(checkReport({ ...valid, comment })).toEqual({ ok: true, report: { ...valid, comment } });
  });
  it('allows an empty comment except for something else', () => {
    for (const reason of REASONS.filter(reason => reason !== 'other')) expect(checkReport({ ...valid, reason, comment: '' }).ok).toBe(true);
    expect(checkReport({ ...valid, reason: 'other', comment: ' \u0000\r\n ' })).toEqual({ ok: false, problems: [{ field: 'comment', message: 'add a comment for something else.' }] });
  });
  it('counts an emoji once at the 1,000-character boundary after cleaning', () => {
    const comment = 'a'.repeat(999) + '😀';
    expect(checkReport({ ...valid, comment }).ok).toBe(true);
    expect(charactersLeft(comment)).toBe(0);
    expect(checkReport({ ...valid, comment: comment + 'b' })).toEqual({ ok: false, problems: [{ field: 'comment', message: 'keep the comment to 1,000 characters or fewer.' }] });
    expect(checkReport({ ...valid, comment: ' \u0000' + comment + '\t ' }).ok).toBe(true);
  });
  it('reports remaining cleaned code points, never a negative count', () => {
    expect(charactersLeft('')).toBe(1000);
    expect(charactersLeft(' \r\na😀\t ')).toBe(998);
    expect(charactersLeft('a\r\nb')).toBe(997);
    expect(charactersLeft('a'.repeat(1001))).toBe(0);
  });
});
