import { describe, expect, it, vi } from 'vitest';
import type { FlagReport } from '../../src/islands/flag';
import { flagItemContext, flagSignedIn, makeFlagSend, watchFlagSession, type FlagClient } from '../../src/islands/flagconnect';
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

/** A client whose session can change between reads, and which announces sign-ins and sign-outs like supabase-js. */
function switchableClient() {
  let session: { user: { id: string } } | null = null;
  const listeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();
  const unsubscribed = vi.fn();
  const client: FlagClient = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => { listeners.delete(callback); unsubscribed(); } } } };
      }),
    },
    rpc: () => Promise.resolve({ data: reportId, error: null }),
  };
  return {
    client,
    unsubscribed,
    listeners,
    /** Changes the stored session without announcing it (another tab wrote it). */
    store: (id: string | null) => { session = id ? { user: { id } } : null; },
    /** Announces a change, as supabase-js does for this tab and, by broadcast, for other tabs. */
    announce: (id: string | null) => { session = id ? { user: { id } } : null; for (const l of listeners) l(id ? 'SIGNED_IN' : 'SIGNED_OUT', session); },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('watchFlagSession (Codex on #237)', () => {
  it('reads the session again on every check, so a sign-in in another tab is picked up when the form reopens', async () => {
    const fake = switchableClient();
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => fake.client, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(seen).toEqual([false]);
    fake.store('user-1');
    watch.check();
    await settle();
    expect(seen).toEqual([false, true]);
    expect(fake.client.auth.getSession).toHaveBeenCalledTimes(2);
    watch.stop();
  });

  it('follows announced sign-ins and sign-outs once the client has loaded, and stops listening when stopped', async () => {
    const fake = switchableClient();
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => fake.client, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(fake.listeners.size).toBe(1);
    fake.announce('user-1');
    fake.announce(null);
    expect(seen).toEqual([false, true, false]);
    watch.check();
    await settle();
    expect(fake.listeners.size).toBe(1); // one subscription, however many checks
    watch.stop();
    expect(fake.unsubscribed).toHaveBeenCalledTimes(1);
    fake.announce('user-1');
    watch.check();
    await settle();
    expect(seen).toEqual([false, true, false, false]);
  });

  it('reuses a check that is still running, and lets a newer announcement win over it', async () => {
    const fake = switchableClient();
    let gate: Promise<void> = Promise.resolve();
    let loads = 0;
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => { loads += 1; await gate; return fake.client; }, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(seen).toEqual([false]);

    let release: () => void = () => {};
    gate = new Promise<void>((resolve) => { release = resolve; });
    fake.store('user-1');
    watch.check(); // the form opens while signed in elsewhere: this check reads true once its load finishes
    watch.check(); // a second open while it runs reuses it
    fake.announce(null); // ...but a sign-out is announced before it finishes
    fake.store('user-1'); // what the slow check will read: older than the announcement
    release();
    await settle();
    expect(loads).toBe(2);
    expect(seen).toEqual([false, false]); // the stale "signed in" from the slow check is dropped
    watch.stop();
  });

  it('reads as signed out, without listening, when accounts are off or the client cannot load', async () => {
    for (const load of [async () => null, async () => { throw new Error('offline'); }]) {
      const seen: boolean[] = [];
      const watch = watchFlagSession(load, (signedIn) => seen.push(signedIn));
      watch.check();
      await settle();
      expect(seen).toEqual([false]);
      watch.stop();
    }
  });

  it('still rechecks on open when the client has no auth events', async () => {
    const { client } = fakeClient({ session: null });
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => client, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(seen).toEqual([false]);
    watch.stop();
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
