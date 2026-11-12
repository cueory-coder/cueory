/**
 * Today's real stat set (content pipeline, docs/CONTENT-PIPELINE.md). Pure logic, kept apart from the island
 * (StatToday.tsx) so it can be unit tested with a fake client (tests/unit/statdaily.test.ts).
 *
 * Off until Christian approves: `statUsesRealQuestions` in src/config/games.ts is false, and the database function
 * this calls (`daily_stat_set`, supabase/migrations/20261112090000_daily_stat_sets.sql) is a draft that is not applied
 * to any project yet.
 *
 * What it does: asks `daily_stat_set` for the student's own calendar day and checks every field of the reply. The reply
 * carries ids, the stem and the choices a to d, and nothing else: a reply with any other field (an answer, a
 * rationale) is refused whole, so a mistake on the server can never put a key on the screen. Grading stays with
 * check_answer, one question at a time, through the questions player's own adapter (stat.ts `remoteStatGrader`).
 * Real questions are for signed-in students (D-86): a signed-out visitor is never sent to the database.
 */
import type { AnswerTransport, CheckItem } from './checkanswer';
import { localDay } from './gameresults';
import type { RemoteQuestions } from './questionsremote';
import { STAT_LETTERS, STAT_QUESTIONS, type StatQuestion } from './stat';
import type { SessionReader, SessionState } from './supabaseclient';

/** The argument of daily_stat_set, exactly as the SQL names it. */
export interface DailySetArguments { p_day: string }
export interface DailySetTransport {
  rpc(name: 'daily_stat_set', args: DailySetArguments): PromiseLike<{ data: unknown; error: unknown }>;
}
/** What the page's client needs: daily_stat_set, check_answer and the local session. */
export type DailyStatClient = DailySetTransport & AnswerTransport & SessionReader;

export interface DailyStatSet {
  day: string;
  questions: StatQuestion[];
  /** The published version each question was shown at, for check_answer. */
  versions: CheckItem[];
}

export type DailyStatView =
  /** Accounts are off in this build: nothing is downloaded or asked. */
  | { view: 'off' }
  | { view: 'signed-out'; next: string }
  /** Fewer than fifteen questions fit stat yet. */
  | { view: 'not-ready' }
  /** The account can't play yet (email not confirmed, two-factor not finished). The message says what to do. */
  | { view: 'blocked'; message: string }
  | { view: 'failed' }
  | { view: 'ready'; set: DailyStatSet; remote: RemoteQuestions };

/** Where sign-in and sign-up come back to. */
export const STAT_PATH = '/play/stat';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// The database's own limits: stems up to 1,000 characters, choices up to 300, printable text only.
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= max && value.trim() !== '' &&
  !/[\u0000-\u001f\u007f-\u009f]/.test(value);

class BadReply extends Error {}
const bad = (): never => { throw new BadReply('the reply did not match the daily set shape'); };

/** A plain object with exactly these keys and no others. */
function exactly(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return bad();
  const record = value as Record<string, unknown>;
  const own = Object.keys(record);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) return bad();
  return record;
}

/** True for a real calendar day written YYYY-MM-DD. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Checks daily_stat_set's reply for `day`. Throws unless it is exactly fifteen questions in positions 1 to 15, each
 * with its own item id, its published version id, a stem and the choices a, b, c and d, and nothing else.
 */
export function parseDailyStatSet(data: unknown, day: string): DailyStatSet {
  const reply = exactly(data, ['day', 'questions']);
  if (reply.day !== day || !Array.isArray(reply.questions) || reply.questions.length !== STAT_QUESTIONS) return bad();
  const questions: StatQuestion[] = [];
  const versions: CheckItem[] = [];
  const seen = new Set<string>();
  for (const [index, value] of (reply.questions as unknown[]).entries()) {
    const row = exactly(value, ['position', 'item_id', 'version_id', 'stem', 'choices']);
    const { position, item_id: itemId, version_id: versionId, stem, choices } = row;
    if (position !== index + 1 || !UUID.test(String(itemId)) || !UUID.test(String(versionId)) ||
        typeof itemId !== 'string' || typeof versionId !== 'string' ||
        seen.has(itemId) || seen.has(versionId) || !isText(stem, 1000)) return bad();
    if (!Array.isArray(choices) || choices.length !== STAT_LETTERS.length) return bad();
    const parsed = (choices as unknown[]).map((choice, at) => {
      const { id, text } = exactly(choice, ['id', 'text']);
      if (id !== STAT_LETTERS[at] || !isText(text, 300)) return bad();
      return { id: STAT_LETTERS[at]!, text };
    });
    seen.add(itemId);
    seen.add(versionId);
    questions.push({ id: itemId, stem, choices: parsed });
    versions.push({ item_id: itemId, id: versionId });
  }
  return { day, questions, versions };
}

/** daily_stat_set's refusals, word for word from the migration, and what the page does with each. */
const REFUSALS: Record<string, DailyStatView> = {
  "sign in to play today's set": { view: 'signed-out', next: STAT_PATH },
  "today's set is not ready yet": { view: 'not-ready' },
  'confirm your email to use this': {
    view: 'blocked', message: "please confirm your email to play today's set. look for the link in your inbox.",
  },
  'complete two-factor sign-in to continue': {
    view: 'blocked', message: "please finish two-factor sign-in to play today's set.",
  },
};

/** Turns a database refusal into what the page shows. Never shows the database's own text. */
export function refusalView(error: unknown): DailyStatView {
  if (error === null || typeof error !== 'object') return { view: 'failed' };
  const message = (error as { message?: unknown }).message;
  return (typeof message === 'string' && Object.hasOwn(REFUSALS, message)) ? REFUSALS[message]! : { view: 'failed' };
}

/** Asks for one day's set and checks it. */
export async function loadDailyStatSet(transport: DailySetTransport, day: string):
  Promise<{ ok: true; set: DailyStatSet } | { ok: false; view: DailyStatView }> {
  if (!isDay(day)) return { ok: false, view: { view: 'failed' } };
  try {
    const reply = await transport.rpc('daily_stat_set', { p_day: day });
    if (reply === null || typeof reply !== 'object') return { ok: false, view: { view: 'failed' } };
    if (reply.error !== null && reply.error !== undefined) return { ok: false, view: refusalView(reply.error) };
    return { ok: true, set: parseDailyStatSet(reply.data, day) };
  } catch {
    return { ok: false, view: { view: 'failed' } };
  }
}

/**
 * Decides what the stat page shows when real questions are on. Accounts off: nothing is asked. Signed out: the
 * database is never called (D-86). Signed in: today's set, with check_answer as the grader's transport.
 */
export async function openDailyStat(
  getClient: () => Promise<DailyStatClient | null>,
  readSession: (client: DailyStatClient) => Promise<SessionState>,
  now: Date,
): Promise<DailyStatView> {
  let client: DailyStatClient | null;
  try { client = await getClient(); }
  catch { return { view: 'failed' }; }
  if (!client) return { view: 'off' };
  let session: SessionState;
  try { session = await readSession(client); }
  catch { return { view: 'failed' }; }
  if (!session.signedIn) return { view: 'signed-out', next: STAT_PATH };
  const loaded = await loadDailyStatSet(client, localDay(now));
  if (!loaded.ok) return loaded.view;
  // The client itself is the transport, so its rpc method keeps its receiver (questionsremote.ts).
  return { view: 'ready', set: loaded.set, remote: { signedIn: true, transport: client, versions: loaded.set.versions } };
}
