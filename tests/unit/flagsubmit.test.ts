import { describe, expect, it } from 'vitest';
import { checkReport, REASONS } from '../../src/islands/flag';
import { flagArguments, type FlagContext } from '../../src/islands/flagsubmit';

const VALID_PAGE = '/learn/anatomy';
const ctx = (page: string): FlagContext => ({ page });

function validReport() {
  return checkReport({
    page: VALID_PAGE,
    reason: 'typo',
    comment: 'There is a typo here.',
  });
}

const ITEM_VERSION_UUID = '00000000-0000-0000-0000-000000000002';

function validReportWithItem() {
  return checkReport({
    page: VALID_PAGE,
    itemId: 'item-abc-123',
    itemVersionId: ITEM_VERSION_UUID,
    reason: 'wrong-fact',
    comment: 'The fact is incorrect.',
  });
}

// ── Valid cases ───────────────────────────────────────────────────────────────

describe('valid flagArguments', () => {
  it('returns ok with expected args for a minimal report', () => {
    const result = flagArguments(validReport(), ctx(VALID_PAGE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.page).toBe(VALID_PAGE);
    expect(result.args.item_id).toBeNull();
    expect(result.args.item_version_id).toBeNull();
    expect(result.args.reason).toBe('typo');
    expect(result.args.comment).toBe('There is a typo here.');
  });

  it('passes item_id and item_version_id through', () => {
    const result = flagArguments(validReportWithItem(), ctx(VALID_PAGE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.item_id).toBe('item-abc-123');
    expect(result.args.item_version_id).toBe(ITEM_VERSION_UUID);
  });

  it('strips query string from page', () => {
    const result = flagArguments(validReport(), ctx('/learn/anatomy?tab=overview'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.page).toBe('/learn/anatomy');
  });

  it('strips hash from page', () => {
    const result = flagArguments(validReport(), ctx('/learn/anatomy#section-2'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.page).toBe('/learn/anatomy');
  });

  it('strips both query and hash from page', () => {
    const result = flagArguments(validReport(), ctx('/learn/anatomy?tab=main#top'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.page).toBe('/learn/anatomy');
  });

  it('accepts the root page /', () => {
    const result = flagArguments(validReport(), ctx('/'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.page).toBe('/');
  });

  it('accepts exactly 200-character page path', () => {
    const longPath = '/' + 'a'.repeat(199);
    const result = flagArguments(validReport(), ctx(longPath));
    expect(result.ok).toBe(true);
  });

  it('passes through the longest allowed comment (1000 chars)', () => {
    const longComment = 'a'.repeat(1000);
    const report = checkReport({ page: VALID_PAGE, reason: 'confusing', comment: longComment });
    const result = flagArguments(report, ctx(VALID_PAGE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.comment.length).toBe(1000);
  });

  it('args object contains exactly the five expected fields', () => {
    const result = flagArguments(validReport(), ctx(VALID_PAGE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.args).sort()).toEqual(['comment', 'item_id', 'item_version_id', 'page', 'reason']);
  });
});

// ── Rejected report ───────────────────────────────────────────────────────────

describe('rejected report', () => {
  it('returns ok:false when checkReport found problems', () => {
    const bad = checkReport({ page: VALID_PAGE, reason: 'not-a-reason', comment: '' });
    const result = flagArguments(bad, ctx(VALID_PAGE));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBeTruthy();
  });
});

// ── Hand-built report re-validation ──────────────────────────────────────────

describe('re-validation on hand-built ok:true reports', () => {
  it('rejects a hand-built report with an invalid reason', () => {
    const fakeReport = {
      ok: true as const,
      report: { page: VALID_PAGE, reason: 'hacked' as typeof REASONS[number], comment: 'fine' },
    };
    const result = flagArguments(fakeReport, ctx(VALID_PAGE));
    expect(result.ok).toBe(false);
  });

  it('rejects a hand-built report with a >1000 character comment', () => {
    const fakeReport = {
      ok: true as const,
      report: { page: VALID_PAGE, reason: 'typo' as const, comment: 'x'.repeat(1001) },
    };
    const result = flagArguments(fakeReport, ctx(VALID_PAGE));
    expect(result.ok).toBe(false);
  });
});

// ── Invalid page ──────────────────────────────────────────────────────────────

describe('invalid page in context', () => {
  it('rejects javascript: scheme', () => {
    const result = flagArguments(validReport(), ctx('javascript:alert(1)'));
    expect(result.ok).toBe(false);
  });

  it('rejects https://other.site', () => {
    const result = flagArguments(validReport(), ctx('https://other.site/page'));
    expect(result.ok).toBe(false);
  });

  it('rejects a path without a leading slash', () => {
    const result = flagArguments(validReport(), ctx('learn/anatomy'));
    expect(result.ok).toBe(false);
  });

  it('rejects a path starting with //', () => {
    const result = flagArguments(validReport(), ctx('//evil.com/path'));
    expect(result.ok).toBe(false);
  });

  it('rejects a page path longer than 200 characters', () => {
    const tooLong = '/' + 'a'.repeat(200);
    const result = flagArguments(validReport(), ctx(tooLong));
    expect(result.ok).toBe(false);
  });

  it('rejects a path containing spaces', () => {
    const result = flagArguments(validReport(), ctx('/learn/a b'));
    expect(result.ok).toBe(false);
  });

  it('rejects a path containing ..', () => {
    const result = flagArguments(validReport(), ctx('/learn/../admin'));
    expect(result.ok).toBe(false);
  });
});
