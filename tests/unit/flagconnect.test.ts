import { describe, expect, it, vi } from 'vitest';
import type { FlagReport } from '../../src/islands/flag';
import { flagItemContext, flagSignedIn, makeFlagSend, type FlagClient } from '../../src/islands/flagconnect';
import type { FlagArgs } from '../../src/islands/flagsubmit';

const reportId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const good: FlagReport = { page: '/learn/study-skills/questions', reason: 'confusing', comment: 'the second choice reads oddly' };

/** A fake shared client. It never touches the network. */
function fakeClient(options: {
  session?: { user: { id: string; email?: string | null } } | null;
  sessionError?: unknown;
  reply?: { data: unknown; error: unknown };
} = {}) {
  const calls: { name: string; args: FlagArgs; receiver: unknown }[] = [];
  const client: FlagClient = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: options.session === undefined ? { user: { id: 'user-1', email: 'student@example.test' } } : options.session },
        error: options.sessionError ?? null,
      })),
    },
    rpc(name, args) {
      calls.push({ name, args, receiver: this });
      return Promise.resolve(options.reply ?? { data: reportId, error: null });
    },
  };
  return { client, calls, load: vi.fn(async () => client) };
}

describe('flagSignedIn', () => {
  it('is true with a session on this browser', async () => {
    expect(await flagSignedIn(fakeClient().load)).toBe(true);
  });

  it('is false with no session, a session error, accounts off or a failed load', async () => {
    expect(await flagSignedIn(fakeClient({ session: null }).load)).toBe(false);
    expect(await flagSignedIn(fakeClient({ sessionError: { message: 'private detail' } }).load)).toBe(false);
    expect(await flagSignedIn(async () => null)).toBe(false);
    expect(await flagSignedIn(async () => { throw new Error('package download failed'); })).toBe(false);
  });
});

describe('makeFlagSend', () => {
  it('sends the exact submit_flag arguments on the shared client and reports sent', async () => {
    const { client, calls, load } = fakeClient();
    const send = makeFlagSend(load);
    expect(await send({ ...good, itemId, itemVersionId: versionId })).toBe('sent');
    expect(calls).toEqual([{
      name: 'submit_flag',
      args: { page: good.page, item_id: itemId, item_version_id: versionId, reason: 'confusing', comment: good.comment },
      receiver: client,
    }]);
  });

  it('sends a page-only report with null item context', async () => {
    const { calls, load } = fakeClient();
    expect(await makeFlagSend(load)(good)).toBe('sent');
    expect(calls[0]!.args).toEqual({ page: good.page, item_id: null, item_version_id: null, reason: 'confusing', comment: good.comment });
  });

  it('asks a signed-out student to sign in when accounts are off, without calling anything', async () => {
    expect(await makeFlagSend(async () => null)(good)).toEqual({ message: 'please sign in to send a report.' });
  });

  it('fails quietly when the client cannot load', async () => {
    expect(await makeFlagSend(async () => { throw new Error('a private connection error'); })(good)).toBe('failed');
  });

  it('turns the rate limit into too-many', async () => {
    const { load } = fakeClient({ reply: { data: null, error: { code: '54000', message: 'that is a lot of reports; please try again later' } } });
    expect(await makeFlagSend(load)(good)).toBe('too-many');
  });

  it.each([
    ['sign in to send a report', 'please sign in to send a report.'],
    ['confirm your email to use this', 'please confirm your email first. the link is in the email we sent you.'],
    ['the page must be an address on this site', 'something went wrong — please try again from the page you were on.'],
    ['pick what is wrong from the list', 'choose what is wrong from the list.'],
    ['the comment is up to 1,000 characters of plain text', 'keep the comment to 1,000 characters or fewer.'],
    ['that question was not found', 'that question could not be found — it may have been removed.'],
  ])('maps "%s" to its plain sentence', async (raw, sentence) => {
    const { load } = fakeClient({ reply: { data: null, error: { message: raw } } });
    expect(await makeFlagSend(load)(good)).toEqual({ message: sentence });
  });

  it.each([
    { data: null, error: { code: 'XX000', message: 'internal database details' } },
    { data: null, error: null },
    { data: 'not-a-report-id', error: null },
  ])('never claims an unsuccessful report was sent, or echoes raw text', async reply => {
    const { load } = fakeClient({ reply });
    expect(await makeFlagSend(load)(good)).toBe('failed');
  });

  it('does not call submit_flag for a sample slug', async () => {
    const { calls, load } = fakeClient();
    expect(await makeFlagSend(load)({ ...good, itemId: 'sample_1', itemVersionId: versionId })).toBe('failed');
    expect(calls).toEqual([]);
  });
});

describe('flagItemContext', () => {
  it('passes nothing for sample pages and both ids for a real item', () => {
    expect(flagItemContext(undefined)).toEqual({});
    expect(flagItemContext({ itemId, itemVersionId: versionId })).toEqual({ itemId, itemVersionId: versionId });
  });

  it.each([
    { itemId: 'study-skills-01-q1', itemVersionId: versionId },
    { itemId, itemVersionId: '' },
    { itemId: '', itemVersionId: versionId },
  ])('fails the build for a slug or half a pair', flagItem => {
    expect(() => flagItemContext(flagItem)).toThrow('database uuids');
  });
});
