import { describe, expect, it, vi } from 'vitest';
import { checkAnswer, checkArguments, type AnswerTransport } from '../../src/islands/checkanswer';

const item = Object.freeze({ item_id: '00000000-0000-4000-8000-000000000001', id: '00000000-0000-4000-8000-000000000002' });
const result = { correct: true, key: ['a'], rationales: { a: 'sample rationale a', b: 'sample rationale b' }, version_id: item.id };
const fake = (data: unknown = result, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) });
const badItems: unknown[] = [
  null, undefined, [], 'sample', {}, { id: item.id }, { item_id: item.item_id },
  { ...item, item_id: 'bad' }, { ...item, id: 'bad' }, { ...item, id: 2 }, { ...item, item_id: null },
  { ...item, id: item.id + ' ' }, { ...item, item_id: '{' + item.item_id + '}' },
  { ...item, id: '00000000-0000-4000-8000-00000000000A' },
  { ...item, item_id: '00000000-0000-4000-8000-00000000000A' },
];
const badPicks: unknown[] = [undefined, null, 'a', {}, [], ['a', 'a'], ['a', 'b', 'c', 'd', 'e', 'a'], ['A'], ['f'], [' a'], [1], [null], new Array(2)];

describe('checkArguments', () => {
  it('uses the published version row’s identifiers, exactly the SQL argument names, and a fresh sorted selection', () => {
    const picked = Object.freeze(['e', 'a', 'c']);
    const request = checkArguments({ ...item, version: 7, stem: 'sample: not sent', extra: 'sample: not sent' }, picked);
    expect(request).toEqual({ ok: true, args: { item_id: item.item_id, version_id: item.id, picked: ['a', 'c', 'e'] } });
    expect(picked).toEqual(['e', 'a', 'c']);
    if (request.ok) expect(request.args.picked).not.toBe(picked);
  });

  it.each([['a'], ['b', 'a'], ['c', 'b', 'a'], ['d', 'c', 'b', 'a'], ['e', 'd', 'c', 'b', 'a']])('accepts one to five distinct letters: %j', (...picked) => {
    expect(checkArguments(item, picked)).toEqual({ ok: true, args: { item_id: item.item_id, version_id: item.id, picked: [...picked].sort() } });
  });

  it.each(badItems.map(value => ({ value })))('refuses the invalid item $value before transport', async ({ value }) => {
    const transport = fake();
    const answer = await checkAnswer(transport, value, ['a']);
    expect(answer).toEqual({ ok: false, message: 'this question did not load correctly. please reload the page.' });
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it.each(badPicks.map(value => ({ value })))('refuses the invalid picks $value before transport', async ({ value }) => {
    const transport = fake();
    const answer = await checkAnswer(transport, item, value);
    expect(answer.ok).toBe(false);
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it('does not invoke getters or accept inherited identifiers', async () => {
    const read = vi.fn(() => { throw new Error('sample: getter must not run'); });
    const getterItem = Object.defineProperty({ item_id: item.item_id }, 'id', { get: read });
    const getterPicks = Object.defineProperty(['a'], '0', { get: read });
    const transport = fake();
    for (const [candidate, picked] of [[getterItem, ['a']], [Object.create(item), ['a']], [item, getterPicks]]) {
      expect((await checkAnswer(transport, candidate, picked)).ok).toBe(false);
    }
    expect(read).not.toHaveBeenCalled();
    expect(transport.rpc).not.toHaveBeenCalled();
  });
});

describe('checkAnswer', () => {
  it('calls only check_answer with the validated version-aware arguments and maps a right result', async () => {
    const transport = fake({ ...result, admin: 'sample: omit' });
    const answer = await checkAnswer(transport, item, ['a']);
    expect(transport.rpc).toHaveBeenCalledExactlyOnceWith('check_answer', { item_id: item.item_id, version_id: item.id, picked: ['a'] });
    expect(answer).toEqual({ ok: true, result: { right: true, key: ['a'], rationales: result.rationales } });
    if (answer.ok) {
      expect(answer.result.key).not.toBe(result.key);
      expect(answer.result.rationales).not.toBe(result.rationales);
    }
  });

  it('preserves a wrong result as false', async () => {
    expect(await checkAnswer(fake({ ...result, correct: false, key: ['b'] }), item, ['a']))
      .toEqual({ ok: true, result: { right: false, key: ['b'], rationales: result.rationales } });
  });

  it('maps a database refusal to plain words and exposes no returned feedback on failure', async () => {
    const error = { code: '55000', message: 'this question was updated; reload it and answer again', details: 'sample: private detail' };
    expect(await checkAnswer(fake(result, error), item, ['a'])).toEqual({
      ok: false, message: 'this question was just updated — please reload the page and answer again.',
    });
  });

  it('maps an unknown refusal or transport rejection without echoing raw details', async () => {
    const secret = 'sample: raw database detail';
    const transport: AnswerTransport = { rpc: vi.fn().mockRejectedValue(new Error(secret)) };
    for (const adapter of [fake(null, { message: secret }), transport]) {
      expect(await checkAnswer(adapter, item, ['a'])).toEqual({ ok: false, message: 'something went wrong — please try again.' });
    }
  });

  it.each([
    null, [], 'sample', {}, { ...result, correct: 'true' }, { ...result, key: [] }, { ...result, key: ['a', 'a'] },
    { ...result, key: ['f'] }, { ...result, key: 'a' }, { ...result, rationales: null },
    { ...result, rationales: {} }, { ...result, rationales: { a: 1 } }, { ...result, rationales: { a: 'sample', f: 'sample' } },
    { ...result, version_id: item.item_id }, { correct: true, key: ['a'], rationales: result.rationales },
  ].map(data => ({ data })))('refuses malformed or wrong-version feedback $data', async ({ data }) => {
    expect(await checkAnswer(fake(data), item, ['a'])).toEqual({ ok: false, message: 'something went wrong — please try again.' });
  });
});
