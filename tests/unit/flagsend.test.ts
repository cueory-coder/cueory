import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { site } from '../../src/config/site';
import { PATIENT_INFO_WARNING } from '../../src/islands/flag';
import { SignedOutReportHelp } from '../../src/islands/FlagForm';
import { makeSend, type FlagRpc } from '../../src/islands/flagsend';
import type { FlagReport } from '../../src/islands/flag';
import type { FlagArgs } from '../../src/islands/flagsubmit';

const id = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const good: FlagReport = { page: '/learn/study-skills', reason: 'typo', comment: 'a spelling issue' };

/** A fake RPC in these tests never needs a network connection. */
function stub(result: { data: unknown; error: unknown } = { data: id, error: null }) {
  const rpc = vi.fn(async (_name: 'submit_flag', _args: FlagArgs) => result);
  return { rpc, send: makeSend(rpc) };
}

describe('makeSend for submit_flag', () => {
  it('sends a validated page-only report with exactly the database arguments', async () => {
    const { rpc, send } = stub();
    expect(await send(good)).toBe('sent');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_flag', {
      page: '/learn/study-skills', item_id: null, item_version_id: null,
      reason: 'typo', comment: 'a spelling issue',
    });
  });

  it('preserves a real question UUID pair without changing the report', async () => {
    const { rpc, send } = stub();
    const report = Object.freeze({ ...good, itemId, itemVersionId: versionId });
    expect(await send(report)).toBe('sent');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_flag', {
      page: good.page, item_id: itemId, item_version_id: versionId,
      reason: good.reason, comment: good.comment,
    });
    expect(report).toEqual({ ...good, itemId, itemVersionId: versionId });
  });

  it('does not send an invalid report, incomplete item context, or a sample slug to a UUID RPC', async () => {
    const { rpc, send } = stub();
    expect(await send({ ...good, page: '//other.example' })).toBe('failed');
    expect(await send({ ...good, reason: 'unknown' as FlagReport['reason'] })).toBe('failed');
    expect(await send({ ...good, itemId })).toBe('failed');
    expect(await send({ ...good, itemId: 'sample_item', itemVersionId: versionId })).toBe('failed');
    expect(await send({ ...good, itemId, itemVersionId: 'not-a-uuid' })).toBe('failed');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps the database rate limit to too-many through studentMessage', async () => {
    const { send } = stub({ data: null, error: { code: '54000', message: 'that is a lot of reports; please try again later' } });
    expect(await send(good)).toBe('too-many');
  });

  it.each([
    ['sign in to send a report', 'please sign in to send a report.'],
    ['confirm your email to use this', 'please confirm your email to send a report — look for the link in your inbox.'],
    ['that question was not found', 'that question could not be found — it may have been removed.'],
  ])('passes a known refusal (%s) on as its plain sentence', async (raw, sentence) => {
    expect(await stub({ data: null, error: { message: raw } }).send(good)).toEqual({ message: sentence });
  });

  it.each([
    { data: null, error: { code: '23505', message: 'internal database details' } },
    { data: null, error: null },
    { data: false, error: null },
    { data: 'not-an-id', error: null },
  ])('returns failed rather than claiming an unsuccessful report was sent', async reply => {
    expect(await stub(reply).send(good)).toBe('failed');
  });

  it('does not expose network exceptions', async () => {
    const rpc: FlagRpc = async () => { throw new Error('a private connection error'); };
    expect(await makeSend(rpc)(good)).toBe('failed');
  });
});

describe('signed-out report help', () => {
  it('shows the configured email address as a mailto link without a send button', () => {
    const html = renderToStaticMarkup(createElement(SignedOutReportHelp));
    expect(html).toContain('a free account is needed');
    expect(html).toContain('href="mailto:' + site.contactEmail + '"');
    expect(html).toContain(site.contactEmail);
    expect(html).toContain(PATIENT_INFO_WARNING.replace("'", '&#x27;'));
    expect(html).not.toMatch(/<button\b/i);
    expect(html).not.toContain('type="submit"');
  });
});
