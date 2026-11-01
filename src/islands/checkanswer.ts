/** Version-aware check_answer adapter (D-86). The injected transport owns authentication and I/O. */
import type { ChoiceId } from './questions';
import { studentMessage } from './rpcerrors';

/** The identifiers on the published public.item_versions row the student was shown. */
export interface CheckItem { item_id: string; id: string }
/** Exact SQL arguments from 20261101100000_attempts_and_check_answer.sql. */
export interface CheckArguments { item_id: string; version_id: string; picked: ChoiceId[] }
export interface AnswerFeedback { right: boolean; key: ChoiceId[]; rationales: Partial<Record<ChoiceId, string>> }
type Problem = { ok: false; message: string };
export type CheckedArguments = { ok: true; args: CheckArguments } | Problem;
export type AnswerOutcome = { ok: true; result: AnswerFeedback } | Problem;
export interface AnswerTransport {
  rpc(name: 'check_answer', args: CheckArguments): PromiseLike<{ data: unknown; error: unknown }>;
}

const uuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (value: object, key: string): unknown => {
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property && 'value' in property ? property.value : undefined;
};

function letters(value: unknown): ChoiceId[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return;
  const result: ChoiceId[] = [];
  for (let index = 0; index < value.length; index++) {
    const letter = own(value, String(index));
    if (typeof letter !== 'string' || !/^[a-e]$/.test(letter) || result.includes(letter as ChoiceId)) return;
    result.push(letter as ChoiceId);
  }
  return result.sort();
}

/** Builds a fresh request. The version row's id is the RPC's version_id, not its item_id or version number. */
export function checkArguments(item: unknown, picked: unknown): CheckedArguments {
  const questionProblem: Problem = { ok: false, message: 'this question did not load correctly. please reload the page.' };
  try {
    if (!plain(item)) return questionProblem;
    const itemId = own(item, 'item_id');
    const versionId = own(item, 'id');
    if (!uuid(itemId) || !uuid(versionId)) return questionProblem;
    const clean = letters(picked);
    if (!clean) return { ok: false, message: 'choose between one and five different answers.' };
    return { ok: true, args: { item_id: itemId, version_id: versionId, picked: clean } };
  } catch {
    return questionProblem;
  }
}

function problem(error?: unknown): Problem {
  try { return { ok: false, message: studentMessage('check_answer', error) }; }
  catch { return { ok: false, message: studentMessage('check_answer', undefined) }; }
}

/** SQL returns correct/key/rationales/version_id; expose only the feedback and require the requested version. */
function feedback(data: unknown, versionId: string): AnswerFeedback | undefined {
  if (!plain(data) || own(data, 'version_id') !== versionId) return;
  const right = own(data, 'correct');
  const key = letters(own(data, 'key'));
  const supplied = own(data, 'rationales');
  if (typeof right !== 'boolean' || !key || !plain(supplied)) return;
  const rationales: AnswerFeedback['rationales'] = {};
  for (const name of Object.keys(supplied)) {
    const text = own(supplied, name);
    if (!/^[a-e]$/.test(name) || typeof text !== 'string' || !text.trim()) return;
    rationales[name as ChoiceId] = text;
  }
  if (key.some(letter => !Object.hasOwn(rationales, letter))) return;
  return { right, key, rationales };
}

export async function checkAnswer(transport: AnswerTransport, item: unknown, picked: unknown): Promise<AnswerOutcome> {
  const checked = checkArguments(item, picked);
  if (!checked.ok) return checked;
  try {
    const response = await transport.rpc('check_answer', checked.args);
    if (!plain(response)) return problem();
    const error = own(response, 'error');
    if (error !== null && error !== undefined) return problem(error);
    const result = feedback(own(response, 'data'), checked.args.version_id);
    return result ? { ok: true, result } : problem();
  } catch (error) {
    return problem(error);
  }
}
