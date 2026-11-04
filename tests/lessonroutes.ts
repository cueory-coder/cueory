/**
 * The lesson pages the build generates from /content (Task 300), worked out the same way the pages do
 * (src/lessons/catalog.ts) but from the JSON files directly, so tests and sweeps can list them without Astro.
 * A new lesson file is swept automatically.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { parseLessonMap } from '../src/islands/lessonmap';
import {
  buildCatalog, contentEntryId, generatedRoutes, type Catalog, type CompanionFile, type LessonFile,
} from '../src/lessons/catalog';

const root = new URL('../', import.meta.url);

function files<T>(folder: string): { id: string; data: T }[] {
  const dir = new URL(`content/${folder}/`, root);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ id: contentEntryId(name), data: JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as T }));
}

/** The catalog of what /content holds today. */
export function contentCatalog(): Catalog {
  const { units } = parseLessonMap(readFileSync(new URL('docs/curriculum/medsurg-lesson-map.csv', root), 'utf8'));
  return buildCatalog({
    lessons: files<LessonFile['data']>('lessons'),
    cards: files<CompanionFile['data']>('cards'),
    fillIn: files<CompanionFile['data']>('fill-in'),
    organizer: files<CompanionFile['data']>('organizer'),
    units,
  });
}

/** Every generated lesson address: each hub and its generated mode pages. */
export const lessonRoutes: readonly string[] = generatedRoutes(contentCatalog());
