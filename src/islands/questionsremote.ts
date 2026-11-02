/** Task 67: only check_answer may supply feedback for a real question (D-33, D-45, D-86).
 * The caller supplies public questions, their published version IDs and an authenticated transport.
 * Keep the transport object intact: a Supabase client's rpc method needs its receiver.
 * https://supabase.com/docs/reference/javascript/rpc
 */
import { checkAnswer, checkArguments, type AnswerTransport, type CheckItem } from './checkanswer';
import { startQuestions, validateResult, type Checker, type Question } from './questions';

export interface RemoteQuestions {
  signedIn: boolean;
  transport: AnswerTransport;
  versions: readonly CheckItem[];
}

const failed = "couldn't check that answer. try again.";
class RemoteAnswerError extends Error {}

/** Only errors created from the validated adapter may supply UI text. Never echo an RPC exception. */
export function answerErrorMessage(error: unknown): string {
  return error instanceof RemoteAnswerError ? error.message : failed;
}

/** The public Question.id is the item_id; CheckItem.id is its published version_id. No answer data is accepted. */
export function remoteChecker(questions: Question[], remote: RemoteQuestions): Checker {
  const clean = startQuestions(questions).questions;
  const versions = new Map<string, CheckItem>();
  for (const version of remote.versions) {
    if (!version || Object.keys(version).some(key => key !== 'item_id' && key !== 'id') ||
        !checkArguments(version, ['a']).ok || versions.has(version.item_id)) {
      throw new Error('invalid published question versions');
    }
    versions.set(version.item_id, { item_id: version.item_id, id: version.id });
  }
  if (versions.size !== clean.length || clean.some(question => !versions.has(question.id))) {
    throw new Error('each question needs its published version');
  }
  const byId = new Map(clean.map(question => [question.id, question]));
  const transport: AnswerTransport = { rpc: (name, args) => remote.transport.rpc(name, args) };

  return async (id, picked) => {
    if (remote.signedIn !== true) throw new RemoteAnswerError('please sign in to check answers.');
    const question = byId.get(id);
    const version = versions.get(id);
    if (!question || !version) throw new RemoteAnswerError('this question did not load correctly. please reload the page.');
    if (!Array.isArray(picked) || picked.length === 0 || new Set(picked).size !== picked.length ||
        picked.some(letter => !question.choices.some(choice => choice.id === letter)) ||
        (question.type === 'single' && picked.length !== 1)) {
      throw new RemoteAnswerError(question.type === 'single' ? 'choose exactly one answer for this question.' : 'choose between one and five different answers.');
    }
    const chosen = [...picked];
    const outcome = await checkAnswer(transport, version, chosen);
    if (!outcome.ok) throw new RemoteAnswerError(outcome.message);
    // Reuse the player's all-or-nothing and choice validation before displaying any server feedback.
    return validateResult(question, chosen, {
      correct: outcome.result.right, key: outcome.result.key, rationales: outcome.result.rationales,
    });
  };
}
