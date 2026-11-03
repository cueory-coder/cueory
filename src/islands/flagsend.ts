/**
 * Connects a validated "flag or comment" report to submit_flag (Task 63).
 *
 * The caller supplies a signed-in client's RPC. The database enforces identity,
 * ownership and rate limits; this helper never uses an admin key and never logs a
 * student's comments or the database's raw error text.
 */
import { checkReport, type FlagReport } from './flag';
import { flagArguments, type FlagArgs } from './flagsubmit';
import { studentMessage } from './rpcerrors';

/** `{ message }` is a refusal the student can act on, already in plain words from studentMessage. */
export type SendResult = 'sent' | 'too-many' | 'failed' | { message: string };
export type FlagRpc = (
  name: 'submit_flag',
  args: FlagArgs,
) => PromiseLike<{ data: unknown; error: unknown }>;

/** PostgreSQL accepts canonical UUIDs even when the version bits are all zero. */
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const RATE_LIMIT_MESSAGE = "you've sent a lot of reports recently — please try again later.";
const FALLBACK_MESSAGE = studentMessage('submit_flag', {});

/** Don't send sample item slugs to an RPC whose item_id argument is a UUID. */
function validItemContext(args: FlagArgs): boolean {
  if ((args.item_id === null) !== (args.item_version_id === null)) return false;
  return (args.item_id === null || UUID.test(args.item_id)) &&
    (args.item_version_id === null || UUID.test(args.item_version_id));
}

/**
 * The FlagForm send callback. No sending occurs until a caller injects an RPC,
 * and an invalid or incomplete response is never reported as a successful send.
 */
export function makeSend(rpc: FlagRpc): (report: FlagReport) => Promise<SendResult> {
  return async (report) => {
    try {
      const checked = checkReport(report);
      if (!checked.ok) return 'failed';
      const parsed = flagArguments(checked, { page: checked.report.page });
      if (!parsed.ok || !validItemContext(parsed.args)) return 'failed';

      const reply = await rpc('submit_flag', parsed.args);
      if (!reply || typeof reply !== 'object') return 'failed';
      if (reply.error != null) {
        const message = studentMessage('submit_flag', reply.error);
        if (message === RATE_LIMIT_MESSAGE) return 'too-many';
        // An unknown refusal keeps the form's own "didn't send" line; a known one says what to do.
        return message === FALLBACK_MESSAGE ? 'failed' : { message };
      }
      // submit_flag returns a report UUID, not a boolean or an empty result.
      return typeof reply.data === 'string' && UUID.test(reply.data) ? 'sent' : 'failed';
    } catch {
      // No raw error, report text or account detail reaches UI/logs.
      return 'failed';
    }
  };
}
