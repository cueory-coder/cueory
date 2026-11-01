/** Pure event validation. No analytics client, identity, storage or network. */
import { dailyGames } from '../config/games';
import { studyModes } from '../config/modes';

export const MAX_COUNT = 10_000;
const modes = new Set<string>(studyModes.map(mode => mode.id));
const games = new Set<string>(dailyGames.map(game => game.id));
type Value = string | number | boolean;
type Check = (value: unknown) => value is Value;

// These are content identifiers, never user-entered labels. Shape validation
// cannot establish an id's provenance: callers must use verified content ids.
const id: Check = (value): value is string => typeof value === 'string'
  && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    || (/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value) && /[a-z]/.test(value)));
const count: Check = (value): value is number => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
const boolean: Check = (value): value is boolean => typeof value === 'boolean';
const mode: Check = (value): value is string => typeof value === 'string' && modes.has(value);
const game: Check = (value): value is string => typeof value === 'string' && games.has(value);

const schemas = {
  mode_started: { mode, lesson_id: id, deck_id: id, item_count: count },
  mode_finished: { mode, lesson_id: id, deck_id: id, item_count: count, correct_count: count },
  card_flipped: { mode, deck_id: id, card_id: id },
  question_checked: { mode, item_id: id, correct: boolean },
  game_finished: { game, solved: boolean, attempts: count },
  diagram_step: { diagram_id: id, step: count },
} as const;

export type StudyEventName = keyof typeof schemas;
export interface StudyEvent {
  name: StudyEventName;
  properties: Record<string, Value>;
}
export type StudyEventResult =
  | { ok: true; event: StudyEvent; dropped: string[] }
  | { ok: false; message: string };

/**
 * Fields are optional. Unknown fields and invalid values are omitted and named
 * in `dropped`; their values are never returned. Only `event` is the prospective
 * analytics payload. Diagnostics must not be sent with it. Before any sender is
 * added, privacy and the source of the supplied content ids need review.
 */
export function studyEvent(name: unknown, props: unknown = {}): StudyEventResult {
  if (typeof name !== 'string' || !Object.hasOwn(schemas, name)) {
    return { ok: false, message: 'Unknown study event.' };
  }
  if (props === null || typeof props !== 'object' || Array.isArray(props)) {
    return { ok: false, message: 'Event properties must be an object.' };
  }
  try {
    const schema: Record<string, Check> = schemas[name as StudyEventName];
    const properties: Record<string, Value> = {};
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(props)) {
      if (Object.hasOwn(schema, key) && schema[key]!(value)) properties[key] = value;
      else dropped.push(key);
    }
    return { ok: true, event: { name: name as StudyEventName, properties }, dropped: dropped.sort() };
  } catch {
    return { ok: false, message: 'Event properties could not be read.' };
  }
}
