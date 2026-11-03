import { describe, expect, it } from 'vitest';
import { studentMessage } from '../../src/islands/rpcerrors';

// ── check_answer ─────────────────────────────────────────────────────────────

describe('check_answer errors', () => {
  it('maps the sign-in refusal', () => {
    expect(studentMessage('check_answer', { message: 'sign in to check an answer' }))
      .toBe('please sign in to check answers.');
  });

  it('maps the missing-fields refusal', () => {
    expect(studentMessage('check_answer', { message: 'an item, the version you were shown and your choices are needed' }))
      .toBe('something went wrong loading the question — please reload the page.');
  });

  it('maps the no-such-question refusal', () => {
    expect(studentMessage('check_answer', { message: 'no such question' }))
      .toBe('that question could not be found — it may have been removed.');
  });

  it('maps the stale-version refusal', () => {
    expect(studentMessage('check_answer', { message: 'this question was updated; reload it and answer again' }))
      .toBe('this question was just updated — please reload the page and answer again.');
  });

  it('maps the wrong-choice-count refusal', () => {
    expect(studentMessage('check_answer', { message: 'pick between one and five different choices' }))
      .toBe('choose between one and five different answers.');
  });

  it('maps the invalid-choice refusal', () => {
    expect(studentMessage('check_answer', { message: 'one of those choices is not part of this question' }))
      .toBe('one of those answers is not part of this question — please reload the page.');
  });

  it('maps the single-answer refusal', () => {
    expect(studentMessage('check_answer', { message: 'pick one choice' }))
      .toBe('choose exactly one answer for this question.');
  });

  it('maps the rate-limit refusal', () => {
    expect(studentMessage('check_answer', { message: 'too many answers checked this hour; try again later' }))
      .toBe("you've checked a lot of answers this hour — try again in a little while.");
  });
});

// ── submit_flag ──────────────────────────────────────────────────────────────

describe('submit_flag errors', () => {
  it('maps the sign-in refusal', () => {
    expect(studentMessage('submit_flag', { message: 'sign in to send a report' }))
      .toBe('please sign in to send a report.');
  });

  it('maps the bad-page refusal', () => {
    expect(studentMessage('submit_flag', { message: 'the page must be an address on this site' }))
      .toBe('something went wrong — please try again from the page you were on.');
  });

  it('maps the bad-reason refusal', () => {
    expect(studentMessage('submit_flag', { message: 'pick what is wrong from the list' }))
      .toBe('choose what is wrong from the list.');
  });

  it('maps the comment-too-long refusal', () => {
    expect(studentMessage('submit_flag', { message: 'the comment is up to 1,000 characters of plain text' }))
      .toBe('keep the comment to 1,000 characters or fewer.');
  });

  it('maps the question-not-found refusal', () => {
    expect(studentMessage('submit_flag', { message: 'that question was not found' }))
      .toBe('that question could not be found — it may have been removed.');
  });

  it('maps the rate-limit refusal', () => {
    expect(studentMessage('submit_flag', { message: 'that is a lot of reports; please try again later' }))
      .toBe("you've sent a lot of reports recently — please try again later.");
  });
});

// ── unknown / fallback ───────────────────────────────────────────────────────

describe('unknown and edge-case errors', () => {
  it('returns the neutral fallback for an unknown check_answer message', () => {
    expect(studentMessage('check_answer', { message: 'something unexpected' }))
      .toBe('something went wrong — please try again.');
  });

  it('returns the neutral fallback for an unknown submit_flag message', () => {
    expect(studentMessage('submit_flag', { message: 'unexpected db error' }))
      .toBe('something went wrong — please try again.');
  });

  it('returns the neutral fallback for a non-object error', () => {
    expect(studentMessage('check_answer', 'raw string error'))
      .toBe('something went wrong — please try again.');
    expect(studentMessage('submit_flag', null))
      .toBe('something went wrong — please try again.');
    expect(studentMessage('check_answer', 42))
      .toBe('something went wrong — please try again.');
  });

  it('returns the neutral fallback for an object with no message', () => {
    expect(studentMessage('check_answer', { code: '23503' }))
      .toBe('something went wrong — please try again.');
  });

  it('no student message contains SQL, a table name or a raw error code', () => {
    const allMessages = [
      studentMessage('check_answer', { message: 'sign in to check an answer' }),
      studentMessage('check_answer', { message: 'an item, the version you were shown and your choices are needed' }),
      studentMessage('check_answer', { message: 'no such question' }),
      studentMessage('check_answer', { message: 'this question was updated; reload it and answer again' }),
      studentMessage('check_answer', { message: 'pick between one and five different choices' }),
      studentMessage('check_answer', { message: 'one of those choices is not part of this question' }),
      studentMessage('check_answer', { message: 'pick one choice' }),
      studentMessage('check_answer', { message: 'too many answers checked this hour; try again later' }),
      studentMessage('submit_flag', { message: 'sign in to send a report' }),
      studentMessage('submit_flag', { message: 'the page must be an address on this site' }),
      studentMessage('submit_flag', { message: 'pick what is wrong from the list' }),
      studentMessage('submit_flag', { message: 'the comment is up to 1,000 characters of plain text' }),
      studentMessage('submit_flag', { message: 'that question was not found' }),
      studentMessage('submit_flag', { message: 'that is a lot of reports; please try again later' }),
      studentMessage('check_answer', { message: 'unknown' }),
    ];
    for (const msg of allMessages) {
      // No raw SQL clauses, table names or SQLSTATE codes
      expect(msg).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|TABLE|COLUMN|CONSTRAINT)\b/);
      expect(msg).not.toMatch(/\battempts\b|\bflags\b|\bpublic\./i);
      expect(msg).not.toMatch(/\b[0-9A-Z]{5}\b/); // SQLSTATE codes like P0002, 28000, 54000
    }
  });
});

describe('confirmed-email refusal (Task 169)', () => {
  it.each(['submit_flag', 'check_answer'] as const)('maps it to a plain sentence for %s', fn => {
    expect(studentMessage(fn, { message: 'confirm your email to use this' }))
      .toBe('please confirm your email first. the link is in the email we sent you.');
  });
});
