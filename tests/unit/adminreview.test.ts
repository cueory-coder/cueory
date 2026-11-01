import { describe, expect, it, vi } from 'vitest';
import {
  editItem, readyToPublish, REVIEWERS, setResult, summary, validateRow,
  type CheckedRow, type ReviewResult, type ReviewRow,
} from '../../src/islands/adminreview';

function sample(result: ReviewResult = 'pending'): ReviewRow {
  return {
    version: 4, risk: 'medium', publicLabel: 'sample: review label',
    reviews: Object.fromEntries(REVIEWERS.map(reviewer => [reviewer, result])) as ReviewRow['reviews'],
  };
}
function row(checked: CheckedRow): ReviewRow {
  if (!checked.ok) throw new Error(checked.message);
  return checked.row;
}
function message(checked: CheckedRow): string {
  expect(checked.ok).toBe(false);
  return checked.ok ? '' : checked.message;
}

describe('review columns and validation', () => {
  it('keeps the eight reviewers in the director’s order', () => {
    expect(REVIEWERS).toEqual(['gpt1', 'gpt2', 'gpt3', 'gemini', 'claude_sonnet', 'codex', 'claude_final', 'christian']);
    expect(Object.isFrozen(REVIEWERS)).toBe(true);
    expect(Object.keys(row(validateRow(sample())).reviews)).toEqual(REVIEWERS);
  });

  it.each(['low', 'medium', 'high'] as const)('accepts risk %s and preserves the sample label exactly', risk => {
    const input = { ...sample(), risk, publicLabel: '  sample: Á label 王  ' };
    expect(row(validateRow(input))).toEqual(input);
  });

  it.each([null, undefined, [], 'sample: wrong shape', 5, true])('returns a plain message for bad row %j', input => {
    expect(message(validateRow(input))).toBe('use a review row with a version, risk, public label and reviewer checks.');
    expect(readyToPublish(input)).toBe(false);
    expect(editItem(input, {}).ok).toBe(false);
    expect(setResult(input, 'gpt1', 'pass', 4).ok).toBe(false);
  });

  it.each([-1, 0, 1.5, NaN, Infinity, '4', Number.MAX_SAFE_INTEGER + 1])('refuses version %j with a plain message', version => {
    expect(message(validateRow({ ...sample(), version }))).toBe('use a whole version of 1 or more.');
    expect(readyToPublish({ ...sample('pass'), version })).toBe(false);
  });

  it.each(['sample: risk', '', null, 1])('refuses unknown risk %j', risk => {
    expect(message(validateRow({ ...sample(), risk }))).toBe('choose low, medium or high risk.');
  });

  it('requires a text label and one explicit, valid check per reviewer', () => {
    expect(message(validateRow({ ...sample(), publicLabel: null }))).toBe('write the public label as text.');
    expect(validateRow({ ...sample(), publicLabel: '' }).ok).toBe(true);
    expect(message(validateRow({ ...sample(), reviews: [] }))).toBe('include one check for every reviewer.');
    const { christian: ignored, ...missing } = sample('pass').reviews;
    expect(message(validateRow({ ...sample(), reviews: missing }))).toBe('give every reviewer a pass, fail or pending check.');
    expect(readyToPublish({ ...sample(), reviews: missing })).toBe(false);
    expect(message(validateRow({ ...sample(), reviews: { ...sample().reviews, gpt1: 'sample: unknown' } })))
      .toBe('give every reviewer a pass, fail or pending check.');
    expect(message(validateRow({ ...sample(), reviews: { ...sample().reviews, other: 'pass' } })))
      .toBe('use only the eight named reviewers.');
  });

  it('ignores unrelated row metadata and copies the allowed data into fresh objects', () => {
    const input = Object.freeze({ ...sample(), reviews: Object.freeze(sample().reviews), privateMetadata: { sample: true } });
    const output = row(validateRow(input));
    expect(output).toEqual(sample());
    expect(output).not.toBe(input);
    expect(output.reviews).not.toBe(input.reviews);
    output.reviews.gpt1 = 'pass';
    expect(input.reviews.gpt1).toBe('pending');
  });

  it('does not accept inherited checks or execute accessors', () => {
    expect(validateRow({ ...sample(), reviews: Object.create(sample('pass').reviews) }).ok).toBe(false);
    const getter = vi.fn(() => 'pass');
    const reviews = Object.defineProperty({ ...sample('pass').reviews }, 'christian', { enumerable: true, get: getter });
    expect(readyToPublish({ ...sample(), reviews })).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it('handles unreadable proxies with plain messages rather than exceptions', () => {
    const unreadable = new Proxy({}, { getPrototypeOf() { throw new Error('sample: cannot read'); } });
    expect(validateRow(unreadable)).toEqual({ ok: false, message: 'use a plain review row that can be read.' });
    expect(readyToPublish(unreadable)).toBe(false);
    expect(editItem(sample(), unreadable)).toEqual({ ok: false, message: 'use plain changes that can be read.' });
    const list = new Proxy([], { get() { throw new Error('sample: cannot read'); } });
    expect(summary(list)).toBe('use a plain list of review rows that can be read.');
  });
});

describe('edits and versioned results', () => {
  it.each([{ publicLabel: 'sample: edited' }, { risk: 'high' }, { publicLabel: 'sample: review label' }, {}])('resets all eight reviews for every edit %j', changes => {
    const input = Object.freeze({ ...sample('pass'), reviews: Object.freeze({ ...sample('pass').reviews, gpt1: 'fail' as const }) });
    const edited = row(editItem(input, changes));
    expect(edited.version).toBe(5);
    expect(edited.publicLabel).toBe(changes.publicLabel ?? input.publicLabel);
    expect(edited.risk).toBe(changes.risk ?? input.risk);
    expect(Object.values(edited.reviews)).toEqual(Array(8).fill('pending'));
    expect(readyToPublish(edited)).toBe(false);
    expect(input.version).toBe(4);
    expect(input.reviews.gpt1).toBe('fail');
    expect(input.reviews.christian).toBe('pass');
    expect(edited).not.toBe(input);
    expect(edited.reviews).not.toBe(input.reviews);
  });

  it.each([null, [], 'sample: bad change', { version: 20 }, { reviews: {} }, { risk: 'sample: invalid' }, { publicLabel: 1 }])('refuses invalid changes %j without mutation', changes => {
    const input = sample('pass');
    expect(editItem(input, changes).ok).toBe(false);
    expect(input).toEqual(sample('pass'));
  });

  it('refuses version overflow instead of reusing an unsafe version', () => {
    expect(message(editItem({ ...sample(), version: Number.MAX_SAFE_INTEGER }, {}))).toBe('this version cannot be increased safely.');
  });

  it.each(REVIEWERS)('records only the named reviewer %s in a new row', reviewer => {
    const input = Object.freeze({ ...sample(), reviews: Object.freeze(sample().reviews) });
    const updated = row(setResult(input, reviewer, 'pass', 4));
    expect(updated).toEqual({ ...sample(), reviews: { ...sample().reviews, [reviewer]: 'pass' } });
    expect(updated).not.toBe(input);
    expect(updated.reviews).not.toBe(input.reviews);
    expect(input).toEqual(sample());
  });

  it.each(['pass', 'fail', 'pending'] as const)('accepts result %s for the exact current version', result => {
    expect(row(setResult(sample(), 'codex', result, 4)).reviews.codex).toBe(result);
  });

  it.each(['sample: unknown', 'constructor', '__proto__', 'toString', null, 1])('refuses unknown reviewer %j', reviewer => {
    expect(message(setResult(sample(), reviewer, 'pass', 4))).toBe('choose one of the eight named reviewers.');
  });
  it.each(['PASS', 'sample: unknown', '', null, true])('refuses unknown result %j', result => {
    expect(message(setResult(sample(), 'codex', result, 4))).toBe('choose pass, fail or pending.');
  });
  it.each([-1, 0, 1.5, Infinity, '4'])('refuses invalid result version %j', version => {
    expect(message(setResult(sample(), 'codex', 'pass', version))).toBe('use a whole version of 1 or more.');
  });
  it.each([3, 5])('refuses a result for a different version %s', version => {
    expect(message(setResult(sample(), 'codex', 'pass', version))).toBe('this result is for a different version. review the current version.');
  });

  it('requires a new complete review after editing a ready item', () => {
    let current = sample();
    for (const reviewer of REVIEWERS) current = row(setResult(current, reviewer, 'pass', 4));
    expect(readyToPublish(current)).toBe(true);
    current = row(editItem(current, { publicLabel: 'sample: new version' }));
    expect(setResult(current, 'christian', 'pass', 4).ok).toBe(false);
    for (const reviewer of REVIEWERS.slice(0, -1)) current = row(setResult(current, reviewer, 'pass', 5));
    expect(readyToPublish(current)).toBe(false);
    current = row(setResult(current, 'christian', 'pass', 5));
    expect(readyToPublish(current)).toBe(true);
  });
});

describe('publish readiness and summary', () => {
  it.each(REVIEWERS)('blocks publication if %s is pending or failed', reviewer => {
    for (const result of ['pending', 'fail'] as const) expect(readyToPublish({ ...sample('pass'), reviews: { ...sample('pass').reviews, [reviewer]: result } })).toBe(false);
  });

  it('counts each row once, with failure taking priority over pending checks', () => {
    const failed = row(setResult(sample(), 'codex', 'fail', 4));
    expect(summary([...Array.from({ length: 3 }, () => sample('pass')), ...Array.from({ length: 5 }, () => sample()), failed]))
      .toBe('3 ready, 5 waiting on reviews, 1 failed');
    expect(summary([])).toBe('0 ready, 0 waiting on reviews, 0 failed');
    expect(summary([sample('fail')])).toBe('0 ready, 0 waiting on reviews, 1 failed');
  });

  it('reports a malformed list or numbered row in plain words', () => {
    expect(summary(null)).toBe('use a list of review rows.');
    expect(summary([sample('pass'), { ...sample(), version: -1 }])).toBe('row 2: use a whole version of 1 or more.');
  });
});
