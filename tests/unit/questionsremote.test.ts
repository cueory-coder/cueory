import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import QuestionsPlayer from '../../src/islands/QuestionsPlayer';
import { answerErrorMessage, remoteChecker, type RemoteQuestions } from '../../src/islands/questionsremote';
import { currentResult, pick, recordResult, startQuestions, type ChoiceId, type Question } from '../../src/islands/questions';
import type { AnswerTransport } from '../../src/islands/checkanswer';
import { studentMessage } from '../../src/islands/rpcerrors';

// Invented non-clinical fixtures only, never question-bank data or a real account.
const itemId = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const questions: Question[] = [{
  id: itemId, type: 'single', stem: 'sample: choose a shape.',
  choices: [{ id: 'a', text: 'sample circle' }, { id: 'b', text: 'sample square' }, { id: 'c', text: 'sample triangle' }],
}];
const feedback = { correct: true, key: ['a'], rationales: { a: 'sample feedback a', b: 'sample feedback b', c: 'sample feedback c' }, version_id: versionId };
function setup(response: { data: unknown; error: unknown } = { data: feedback, error: null }) {
  const rpc = vi.fn<AnswerTransport['rpc']>().mockResolvedValue(response);
  const remote: RemoteQuestions = { signedIn: true, transport: { rpc }, versions: [{ item_id: itemId, id: versionId }] };
  return { remote, rpc, check: remoteChecker(questions, remote) };
}

describe('remote question checking', () => {
  it('does not request feedback when prepared, and sends exactly the published item/version and picks on check', async () => {
    const { check, rpc } = setup();
    expect(rpc).not.toHaveBeenCalled();
    expect(await check(itemId, ['a'])).toEqual({ correct: true, key: ['a'], rationales: feedback.rationales });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('check_answer', { item_id: itemId, version_id: versionId, picked: ['a'] });
  });

  it('preserves the RPC receiver', async () => {
    const client: AnswerTransport = { rpc() {
      expect(this).toBe(client);
      return Promise.resolve({ data: feedback, error: null });
    } };
    const { remote } = setup();
    await expect(remoteChecker(questions, { ...remote, transport: client })(itemId, ['a'])).resolves.toHaveProperty('correct', true);
  });

  it('has no feedback while a request is pending and records it only after a valid response', async () => {
    let resolve!: (value: { data: unknown; error: null }) => void;
    const { remote, rpc } = setup();
    rpc.mockImplementation(() => new Promise(done => { resolve = done; }));
    let state = pick(startQuestions(questions), 'a');
    const answer = remoteChecker(questions, remote)(itemId, [...state.picked]);
    expect(currentResult(state)).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain('sample feedback');
    resolve({ data: feedback, error: null });
    state = recordResult(state, await answer);
    expect(currentResult(state)).toMatchObject({ correct: true, key: ['a'], rationales: feedback.rationales });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('snapshots public versions and picked choices before awaiting the server', async () => {
    let resolve!: (value: { data: unknown; error: null }) => void;
    const { remote, rpc, check } = setup();
    rpc.mockImplementation(() => new Promise(done => { resolve = done; }));
    remote.versions[0]!.id = '00000000-0000-4000-8000-000000000099';
    const picks: ChoiceId[] = ['a'];
    const pending = check(itemId, picks);
    picks[0] = 'b';
    expect(rpc.mock.calls[0]![1]).toEqual({ item_id: itemId, version_id: versionId, picked: ['a'] });
    resolve({ data: feedback, error: null });
    await expect(pending).resolves.toHaveProperty('correct', true);
  });

  it.each([false, undefined, null, 1, 'true'])('refuses a non-true sign-in state without a request (%s)', async signedIn => {
    const { remote, rpc } = setup();
    remote.signedIn = signedIn as boolean;
    await expect(remoteChecker(questions, remote)(itemId, ['a'])).rejects.toThrow('please sign in');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([[], ['a', 'b'], ['a', 'a'], ['e'], ['invalid']].map(picks => ({ picks })))('refuses invalid single-answer picks %# without a request', async ({ picks }) => {
    const { check, rpc } = setup();
    await expect(check(itemId, picks as ChoiceId[])).rejects.toThrow('choose exactly one');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not request an unknown item', async () => {
    const { check, rpc } = setup();
    await expect(check('unknown', ['a'])).rejects.toThrow('reload the page');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { picks: ['a', 'c'], correct: true },
    { picks: ['c', 'a'], correct: true },
    { picks: ['a'], correct: false },
    { picks: ['a', 'b', 'c'], correct: false },
  ])('keeps select-all all-or-nothing for $picks', async ({ picks, correct }) => {
    const { remote, rpc } = setup({ data: { ...feedback, key: ['a', 'c'], correct }, error: null });
    const check = remoteChecker([{ ...questions[0]!, type: 'sata' }], remote);
    await expect(check(itemId, picks as ChoiceId[])).resolves.toMatchObject({ correct, key: ['a', 'c'] });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    'sign in to check an answer',
    'too many answers checked this hour; try again later',
    'this question was updated; reload it and answer again',
    'no such question',
    'internal SQL and private details must not be shown',
  ])('maps a refusal to the existing plain-language message: %s', async message => {
    const { check } = setup({ data: feedback, error: { message, code: 'P0001' } });
    const error = await check(itemId, ['a']).catch(error => error);
    expect(answerErrorMessage(error)).toBe(studentMessage('check_answer', { message }));
    expect(answerErrorMessage(error)).not.toContain('private details');
  });

  it('maps a rejected request without showing its exception text', async () => {
    const { remote, rpc } = setup();
    rpc.mockRejectedValue(new Error('private provider failure'));
    const error = await remoteChecker(questions, remote)(itemId, ['a']).catch(error => error);
    expect(answerErrorMessage(error)).toBe(studentMessage('check_answer', undefined));
    expect(answerErrorMessage(new Error('raw sample error'))).toBe("couldn't check that answer. try again.");
  });

  it.each([
    null,
    { ...feedback, version_id: '00000000-0000-4000-8000-000000000099' },
    { ...feedback, correct: 'true' },
    { ...feedback, key: ['d'], rationales: { d: 'not a choice' } },
    { ...feedback, key: ['a', 'b'] },
    { ...feedback, correct: false },
    { ...feedback, rationales: { a: '' } },
    { ...feedback, rationales: { a: 'sample', d: 'not a choice' } },
  ])('refuses malformed or mismatched feedback %#', async data => {
    const { check } = setup({ data, error: null });
    await expect(check(itemId, ['a'])).rejects.toThrow();
  });

  it.each([
    [],
    [{ item_id: itemId, id: 'not-a-version' }],
    [{ item_id: versionId, id: itemId }],
    [{ item_id: itemId, id: versionId }, { item_id: itemId, id: versionId }],
    [{ item_id: itemId, id: versionId, key: ['a'] }],
  ].map(versions => ({ versions })))('refuses invalid version metadata %# before any request', ({ versions }) => {
    const { remote, rpc } = setup();
    expect(() => remoteChecker(questions, { ...remote, versions })).toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects answer data on question inputs', () => {
    const { remote, rpc } = setup();
    const withAnswers = [{ ...questions[0]!, key: ['a'], rationales: feedback.rationales }];
    expect(() => remoteChecker(withAnswers, remote)).toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('real QuestionsPlayer initial render', () => {
  it('requires sign-in and does not render questions or contact the server when signed out', () => {
    const { remote, rpc } = setup();
    const html = renderToStaticMarkup(createElement(QuestionsPlayer, { questions, remote: { ...remote, signedIn: false } }));
    expect(html).toContain('a free account is needed for real questions.');
    expect(html).toContain('href="/signin"');
    expect(html).not.toContain('<fieldset');
    expect(html).not.toContain('sample circle');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('renders only public content before an answer and performs no RPC during SSR', () => {
    const { remote, rpc } = setup();
    const html = renderToStaticMarkup(createElement(QuestionsPlayer, { questions, remote }));
    expect(html).toContain('sample circle');
    expect(html).toContain('type="radio"');
    expect(html).not.toContain('sample feedback');
    expect(html).not.toContain('right.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed for missing version metadata', () => {
    const { remote, rpc } = setup();
    const html = renderToStaticMarkup(createElement(QuestionsPlayer, { questions, remote: { ...remote, versions: [] } }));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<fieldset');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps the existing injected sample checker path without requiring an account', () => {
    const check = vi.fn().mockResolvedValue({ correct: true, key: ['a'], rationales: feedback.rationales });
    const html = renderToStaticMarkup(createElement(QuestionsPlayer, { questions, check }));
    expect(html).toContain('sample circle');
    expect(html).not.toContain('free account');
    expect(html).not.toContain('sample feedback');
    expect(check).not.toHaveBeenCalled();
  });
});
