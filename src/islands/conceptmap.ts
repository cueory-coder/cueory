/** Matches the adaptive quiz's status vocabulary; its module is not yet on this base branch. */
export type ConceptStatus = 'not started' | 'learning' | 'getting there' | 'got it';
export interface ConceptItem { concept: string; status: ConceptStatus; description: string }
export const STATUS_ORDER = ['got it', 'getting there', 'learning', 'not started'] as const;
export type ConceptFilter = ConceptStatus | 'all';

const predictionWords = /%|\b(?:chance|odds|likely|likelihood|probably|probability|predict[a-z]*|percent[a-z]*|score)\b/i;
const examWords = /\b(?:exam|exams|nclex|pass|passing|passed)\b/i;
const describesExamResults = (text: string) => predictionWords.test(text) && examWords.test(text);

export function parseItems(data: unknown): ConceptItem[] {
  if (!Array.isArray(data) || data.length === 0) throw new Error('the concept map needs at least one concept.');
  const seen = new Set<string>();
  return Array.from(data).map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('each concept must be an object.');
    const item = value as Record<string, unknown>;
    if (typeof item.concept !== 'string' || !item.concept.trim()) throw new Error('each concept needs a name.');
    if (typeof item.description !== 'string' || !item.description.trim()) throw new Error('each concept needs a description.');
    if ([...item.concept].length > 200) throw new Error('a concept name can have at most 200 characters.');
    if ([...item.description].length > 1_000) throw new Error('a description can have at most 1,000 characters.');
    if (describesExamResults(item.concept) || describesExamResults(item.description)) {
      throw new Error('describe the concept without exam results.');
    }
    if (typeof item.status !== 'string' || !STATUS_ORDER.includes(item.status as ConceptStatus)) throw new Error('each concept needs a known status.');
    const key = item.concept.trim().toLowerCase();
    if (seen.has(key)) throw new Error('a concept is repeated.');
    seen.add(key);
    return { concept: item.concept, description: item.description, status: item.status as ConceptStatus };
  });
}

export function countsInWords(items: readonly ConceptItem[]): string {
  const counts = STATUS_ORDER.map((status) => ({ status, count: items.filter((item) => item.status === status).length }));
  const shown = counts.filter(({ count }) => count > 0).map(({ status, count }) => `${count} ${status}`);
  return shown.length ? `${shown.join(', ')}.` : 'no concepts yet.';
}

export function filterItems(items: readonly ConceptItem[], filter: ConceptFilter): ConceptItem[] {
  return filter === 'all' ? [...items] : items.filter((item) => item.status === filter);
}
