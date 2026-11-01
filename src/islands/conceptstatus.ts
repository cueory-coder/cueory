/** Adapts stored attempts to the existing adaptive rules; it does not define another progress model. */
import { conceptStatus, type AdaptiveAttempt, type AdaptiveQuestion } from './adaptive';
import { parseItems, type ConceptItem } from './conceptmap.ts';

export interface ConceptAttempt {
  item_id: string;
  concept_id: string;
  correct: boolean;
  level: 1 | 2 | 3;
  /** Postgres ISO timestamp, including Z or an offset and up to six fractional digits. */
  created_at: string;
}
export type ConceptDefinition = Pick<ConceptItem, 'concept'> & { id: string };
export interface ConceptStatusItem extends ConceptItem { id: string }
export interface ConceptStatuses { statuses: ConceptStatusItem[]; skipped: number }

const own = (source: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

function timestamp(value: unknown): bigint | undefined {
  if (typeof value !== 'string') return;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || parts[1].startsWith('0000') || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) return;
  const day = Date.parse(`${parts[1]}T00:00:00.000Z`);
  const millis = Date.parse(value);
  if (!Number.isFinite(day) || !Number.isFinite(millis) || new Date(day).toISOString().slice(0, 10) !== parts[1]) return;
  // Date.parse retains milliseconds. The remaining digits keep sub-millisecond attempts in their actual order.
  return BigInt(millis) * 1_000n + BigInt((parts[5] ?? '').padEnd(6, '0').slice(3));
}

interface OrderedAttempt {
  correct: boolean;
  level: 1 | 2 | 3;
  time: bigint;
  index: number;
}

/** Unknown concepts and malformed attempts are counted as skipped; nothing from those records is copied out. */
export function statusesFrom(attempts: readonly ConceptAttempt[], concepts: readonly ConceptDefinition[]): ConceptStatuses {
  if (!Array.isArray(attempts) || !Array.isArray(concepts)) throw new Error('use lists of attempts and concepts.');
  const seen = new Set<string>();
  const definitions = concepts.map(value => {
    if (!record(value) || !id(own(value, 'id')) || seen.has(own(value, 'id') as string)) {
      throw new Error('each concept needs a different, nonempty id.');
    }
    const conceptId = own(value, 'id') as string;
    seen.add(conceptId);
    return { id: conceptId, concept: own(value, 'concept') as string };
  });
  // Keep the map's own name/duplicate/prediction validation, without copying its rules.
  if (definitions.length) parseItems(definitions.map(value => ({ concept: value.concept, status: 'not started', description: 'this concept has not been started.' })));
  const grouped = new Map(definitions.map(value => [value.id, [] as OrderedAttempt[]]));
  let skipped = 0;
  for (let index = 0; index < attempts.length; index++) {
    const value = own(attempts, String(index));
    if (!record(value)) { skipped++; continue; }
    const concept = own(value, 'concept_id');
    const group = typeof concept === 'string' ? grouped.get(concept) : undefined;
    if (!group) { skipped++; continue; }
    const correct = own(value, 'correct');
    const level = own(value, 'level');
    const time = timestamp(own(value, 'created_at'));
    if (!id(own(value, 'item_id')) || typeof correct !== 'boolean' ||
        (level !== 1 && level !== 2 && level !== 3) || time === undefined) {
      skipped++;
      continue;
    }
    group.push({ correct, level, time, index });
  }
  const statuses = definitions.map(definition => {
    const history = grouped.get(definition.id)!.toSorted((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : a.index - b.index);
    // A question may recur at another recorded level. Per-attempt join IDs preserve that metadata instead of
    // letting adaptive.ts's first-question-ID rule overwrite the later level.
    const questions: AdaptiveQuestion[] = history.map(value => ({
      id: `attempt-${value.index}`, concept: definition.concept, level: value.level,
    }));
    const answers: AdaptiveAttempt[] = history.map(value => ({ questionId: `attempt-${value.index}`, right: value.correct }));
    if (!questions.length) questions.push({ id: 'unstarted', concept: definition.concept, level: 1 });
    const progress = conceptStatus(questions, answers)[0]!;
    return { id: definition.id, concept: progress.concept, status: progress.status, description: progress.description };
  });
  return { statuses, skipped };
}
