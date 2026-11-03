/**
 * Connects the "flag or comment" form to the page's shared Supabase client (Task 171).
 *
 * The client is handed in as a loader, so nothing is downloaded until the form asks and the logic can be tested with a
 * fake. Accounts off (a null client), no session, or any error reads as signed out. Sending goes through makeSend,
 * which checks the report, calls submit_flag and maps every refusal through studentMessage. The browser's session is
 * only used to decide which panel to show: submit_flag checks the signed token itself.
 */
import type { FlagArgs } from './flagsubmit';
import { makeSend, type SendResult } from './flagsend';
import { studentMessage } from './rpcerrors';
import { sessionStateFrom, type SessionReader } from './supabaseclient';
import type { FlagReport } from './flag';

/** A sign-in or sign-out, in this tab or (through supabase-js's broadcast) another one. */
type AuthListener = (event: string, session: { user?: { id?: unknown } | null } | null) => void;

/** The parts of the Supabase client the flag form uses. */
export interface FlagClient extends SessionReader {
  auth: SessionReader['auth'] & {
    onAuthStateChange?(callback: AuthListener): { data: { subscription: { unsubscribe(): void } } };
  };
  rpc(name: 'submit_flag', args: FlagArgs): PromiseLike<{ data: unknown; error: unknown }>;
}
export type LoadFlagClient = () => Promise<FlagClient | null>;

/** Whether this browser has a signed-in session. */
export async function flagSignedIn(load: LoadFlagClient): Promise<boolean> {
  try {
    return (await sessionStateFrom(await load())).signedIn;
  } catch {
    return false;
  }
}

export interface FlagSessionWatch {
  /** Reads the session again (when the page is idle and every time the form opens). A check already running is reused. */
  check(): void;
  /** Stops listening; nothing is reported afterwards. */
  stop(): void;
}

/**
 * Keeps the form's signed-in state current instead of trusting the first answer: every `check()` reads the browser's
 * session again, and once the client has loaded, sign-ins and sign-outs (from any tab) are followed as they happen.
 * A check that was already running when a newer sign-in or sign-out arrived is dropped, so the newest state wins.
 */
export function watchFlagSession(load: LoadFlagClient, report: (signedIn: boolean) => void): FlagSessionWatch {
  let stopped = false;
  let running = false;
  let latest = 0;
  let subscription: { unsubscribe(): void } | null = null;

  const listen = (client: FlagClient | null) => {
    if (stopped || subscription || !client || typeof client.auth?.onAuthStateChange !== 'function') return;
    try {
      subscription = client.auth.onAuthStateChange((_event, session) => {
        if (stopped) return;
        latest += 1;
        report(typeof session?.user?.id === 'string' && session.user.id !== '');
      }).data.subscription;
    } catch {
      // Rechecking when the form opens still keeps it current.
    }
  };

  return {
    check() {
      if (stopped || running) return;
      running = true;
      const mine = ++latest;
      void (async () => {
        let client: FlagClient | null = null;
        try {
          client = await load();
        } catch {
          client = null;
        }
        const signedIn = await flagSignedIn(async () => client);
        running = false;
        if (stopped) return;
        if (mine === latest) report(signedIn);
        listen(client);
      })();
    },
    stop() {
      stopped = true;
      subscription?.unsubscribe();
      subscription = null;
    },
  };
}

/** The FlagForm send callback, using the shared client. */
export function makeFlagSend(load: LoadFlagClient): (report: FlagReport) => Promise<SendResult> {
  return async (report) => {
    let client: FlagClient | null;
    try {
      client = await load();
    } catch {
      return 'failed';
    }
    if (!client) return { message: studentMessage('submit_flag', { message: 'sign in to send a report' }) };
    // Called on the client itself: supabase-js's rpc needs its receiver.
    return makeSend((name, args) => client.rpc(name, args))(report);
  };
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * The item a page shows, for its flag reports. Only real database ids are accepted (submit_flag's item_id and
 * item_version_id are uuids), so a page that passes a sample slug or half a pair fails the build instead of shipping
 * a form that can never send. Sample pages pass nothing.
 */
export function flagItemContext(
  flagItem: { itemId: string; itemVersionId: string } | undefined,
): { itemId?: string; itemVersionId?: string } {
  if (flagItem === undefined) return {};
  const { itemId, itemVersionId } = flagItem;
  if (typeof itemId !== 'string' || !UUID.test(itemId) || typeof itemVersionId !== 'string' || !UUID.test(itemVersionId)) {
    throw new Error('flagItem needs the item id and the item version id, both database uuids');
  }
  return { itemId, itemVersionId };
}
