/**
 * Reads /content and the curriculum map at build time and returns the lesson catalog (Task 300). Pages call this from
 * getStaticPaths; the rules themselves are in catalog.ts so they can be unit tested.
 */
import { getCollection } from 'astro:content';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLessonMap } from '../islands/lessonmap';
import { buildCatalog, type Catalog } from './catalog';

let cached: Promise<Catalog> | undefined;

async function load(): Promise<Catalog> {
  const { units, problems: mapProblems } = parseLessonMap(readFileSync(resolve('docs/curriculum/medsurg-lesson-map.csv'), 'utf8'));
  if (mapProblems.length) {
    throw new Error('the curriculum map has problems: ' + mapProblems.map((problem) => `row ${problem.row}: ${problem.message}`).join('; '));
  }
  const [lessons, cards, fillIn, organizer] = await Promise.all([
    getCollection('lessons'), getCollection('cards'), getCollection('fill-in'), getCollection('organizer'),
  ]);
  const catalog = buildCatalog({ lessons, cards, fillIn, organizer, units });
  if (catalog.problems.length) throw new Error('the lessons in /content cannot be built:\n- ' + catalog.problems.join('\n- '));
  return catalog;
}

/** The catalog, read once per build. */
export function lessonCatalog(): Promise<Catalog> {
  cached ??= load();
  return cached;
}
