/**
 * Which lessons and study-mode pages the site builds from /content (Task 300). Pure: no file reading, no astro:content,
 * so it can be unit tested. src/lessons/load.ts feeds it the collections and the curriculum map.
 *
 * Status rules (D-92, CLAUDE.md rule 7, Christian's decisions of 2 Nov 2026):
 * - `published` (approved by Christian): shown normally.
 * - `placeholder` or `sample`: shown with its label ("these cards are placeholders", "this is a sample…").
 * - `draft`, `in_review` or anything else: never built. A study mode of a lesson that isn't built isn't built either.
 *
 * A lesson file is named by its lesson id from docs/curriculum/medsurg-lesson-map.csv, in lowercase
 * (`u00-t01-l01.json` is lesson U00-T01-L01) and is served at /learn/<file name>. The one older lesson that predates
 * the map keeps its address (study-skills-01 at /learn/study-skills). Cards, fill-in and organizer files name their
 * lesson in their `lesson` field.
 */
import type { MapUnit } from '../islands/lessonmap';

export type Visibility = 'normal' | 'labeled' | 'hidden';

/** How a file with this status appears. Unknown statuses are hidden, so a typo never publishes anything. */
export function visibility(status: unknown): Visibility {
  if (status === 'published') return 'normal';
  if (status === 'placeholder' || status === 'sample') return 'labeled';
  return 'hidden';
}

/** Plain-language labels must preserve the distinction between a sample and a placeholder. */
export function statusNotice(status: unknown, kind: 'lesson' | 'cards'): string | null {
  if (status === 'placeholder') return kind === 'lesson'
    ? 'this lesson is a placeholder. the finished lesson is still being prepared.'
    : 'these cards are placeholders.';
  if (status === 'sample') return kind === 'lesson'
    ? 'this is a sample lesson. the finished lesson is still being prepared.'
    : 'these cards are samples.';
  return null;
}

/** Lessons that predate the curriculum map, with the address and course name they already had. */
export const LEGACY_LESSONS: Readonly<Record<string, { slug: string; course: string }>> = {
  'study-skills-01': { slug: 'study-skills', course: 'how to study for nursing school' },
};

/**
 * Study pages built by hand for one lesson rather than generated (label it and the sample questions, D-92). Real
 * questions come from the database (Task 172), and label it stays a sample at launch (Christian, 2 Nov 2026).
 */
export const HAND_BUILT_MODES: Readonly<Record<string, readonly ('label-it' | 'questions')[]>> = {
  'study-skills-01': ['label-it', 'questions'],
};

/** Addresses under /learn that are pages of their own, so no lesson may take them. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['index', 'questions', 'video-sample']);

const CURRICULUM_FILE = /^u(\d{2})-t(\d{2})-l(\d{2})$/;

/** The generated study-mode pages, in the hub's order, with the address each one gets under its lesson. */
export const GENERATED_MODES = [
  { id: 'cards', page: 'cards', source: 'cards' },
  { id: 'learn', page: 'learn-mode', source: 'cards' },
  { id: 'matching', page: 'matching', source: 'cards' },
  { id: 'organizer', page: 'organizer', source: 'organizer' },
  { id: 'fill-in', page: 'fill-in', source: 'fill-in' },
] as const;
export type GeneratedModeId = (typeof GENERATED_MODES)[number]['id'];
export type ModeId = GeneratedModeId | 'label-it' | 'questions';
export type CompanionKind = 'cards' | 'fill-in' | 'organizer';

/** The hub's order of every mode (Task 81). */
export const HUB_ORDER: readonly ModeId[] = ['cards', 'learn', 'matching', 'organizer', 'fill-in', 'label-it', 'questions'];

export interface LessonFile {
  id: string;
  data: { title: string; summary: string; status: string; course: string; order: number };
}
export interface CompanionFile {
  id: string;
  data: { lesson: string; status: string };
}
export interface CatalogInput {
  lessons: readonly LessonFile[];
  cards: readonly CompanionFile[];
  fillIn: readonly CompanionFile[];
  organizer: readonly CompanionFile[];
  units: readonly MapUnit[];
}

export interface CatalogCompanion { id: string; labeled: boolean }
export interface CatalogMode { id: ModeId; href: string }
export interface CatalogLesson {
  /** The lesson file's name, without .json. */
  id: string;
  slug: string;
  href: string;
  /** The curriculum lesson id (U00-T01-L01), or undefined for an older lesson outside the map. */
  curriculumId?: string;
  unitId?: string;
  /** How the library names it: the course for an older lesson, the lesson's own title otherwise. */
  name: string;
  /** The small line above every page's heading, e.g. "how to study for nursing school · lesson 1". */
  context: string;
  /** A short name for page titles: "lesson 1" for an older lesson, the lesson's title otherwise. */
  short: string;
  /** What page descriptions say the page is for, e.g. "lesson 1 of how to study for nursing school". */
  about: string;
  labeled: boolean;
  cards?: CatalogCompanion;
  fillIn?: CatalogCompanion;
  organizer?: CatalogCompanion;
  modes: CatalogMode[];
}
export interface Catalog { lessons: CatalogLesson[]; problems: string[] }

function findInMap(units: readonly MapUnit[], lessonId: string) {
  for (const unit of units) {
    for (const topic of unit.topics) {
      const lesson = topic.lessons.find((candidate) => candidate.lesson_id === lessonId);
      if (lesson) return { unit, topic, lesson };
    }
  }
  return undefined;
}

/**
 * Builds the catalog, or lists every problem (a file name that isn't a lesson id, a companion naming a lesson that
 * doesn't exist, two files of one mode for the same lesson). The pages refuse to build while there are problems.
 */
export function buildCatalog(input: CatalogInput): Catalog {
  const problems: string[] = [];
  const lessonIds = new Set(input.lessons.map((lesson) => lesson.id));
  const lessons: CatalogLesson[] = [];
  const slugs = new Set<string>();

  for (const file of input.lessons) {
    const legacy = LEGACY_LESSONS[file.id];
    const match = CURRICULUM_FILE.exec(file.id);
    if (!legacy && !match) {
      problems.push(`content/lessons/${file.id}.json: name a lesson file by its lesson id from docs/curriculum/medsurg-lesson-map.csv, in lowercase, like u00-t01-l01.json.`);
      continue;
    }
    const curriculumId = match ? `U${match[1]}-T${match[2]}-L${match[3]}` : undefined;
    const place = curriculumId ? findInMap(input.units, curriculumId) : undefined;
    if (curriculumId && !place) {
      problems.push(`content/lessons/${file.id}.json: lesson ${curriculumId} is not in docs/curriculum/medsurg-lesson-map.csv.`);
      continue;
    }
    const slug = legacy?.slug ?? file.id;
    if (RESERVED_SLUGS.has(slug) || slugs.has(slug)) {
      problems.push(`content/lessons/${file.id}.json: the address /learn/${slug} is already taken.`);
      continue;
    }
    slugs.add(slug);
    const shown = visibility(file.data.status);
    if (shown === 'hidden') continue;
    const href = `/learn/${slug}`;
    const short = place ? file.data.title : `lesson ${file.data.order}`;
    lessons.push({
      id: file.id,
      slug,
      href,
      curriculumId,
      unitId: place?.unit.id,
      name: legacy ? legacy.course : file.data.title,
      context: place ? `${place.unit.title} · ${place.topic.title}` : `${legacy!.course} · ${short}`,
      short,
      about: place ? file.data.title : `${short} of ${legacy!.course}`,
      labeled: shown === 'labeled',
      modes: [],
    });
  }

  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const attach = (kind: CompanionKind, files: readonly CompanionFile[], key: 'cards' | 'fillIn' | 'organizer') => {
    const seen = new Map<string, string>();
    for (const file of files) {
      const owner = file.data.lesson;
      if (!lessonIds.has(owner)) {
        problems.push(`content/${kind}/${file.id}.json: its lesson "${owner}" has no file in content/lessons.`);
        continue;
      }
      const shown = visibility(file.data.status);
      if (shown === 'hidden') continue;
      const earlier = seen.get(owner);
      if (earlier) {
        problems.push(`content/${kind}/${file.id}.json: lesson "${owner}" already has ${kind} in ${earlier}.json; keep one file per lesson.`);
        continue;
      }
      seen.set(owner, file.id);
      const lesson = byId.get(owner);
      if (lesson) lesson[key] = { id: file.id, labeled: shown === 'labeled' };
    }
  };
  attach('cards', input.cards, 'cards');
  attach('fill-in', input.fillIn, 'fillIn');
  attach('organizer', input.organizer, 'organizer');

  for (const lesson of lessons) {
    const has = { cards: !!lesson.cards, 'fill-in': !!lesson.fillIn, organizer: !!lesson.organizer };
    const generated = new Map<ModeId, string>(GENERATED_MODES.filter((mode) => has[mode.source]).map((mode) => [mode.id, mode.page]));
    for (const id of HAND_BUILT_MODES[lesson.id] ?? []) generated.set(id, id);
    lesson.modes = HUB_ORDER.filter((id) => generated.has(id)).map((id) => ({ id, href: `${lesson.href}/${generated.get(id)}` }));
  }

  // Older lessons first, then the curriculum in its own order.
  lessons.sort((a, b) => (a.curriculumId ?? '').localeCompare(b.curriculumId ?? '') || a.id.localeCompare(b.id));
  return { lessons, problems };
}

/** One getStaticPaths entry per lesson that has the given generated mode. */
export function pathsFor(catalog: Catalog, mode: GeneratedModeId | 'hub') {
  return catalog.lessons
    .filter((lesson) => mode === 'hub' || lesson.modes.some((candidate) => candidate.id === mode))
    .map((lesson) => ({ params: { lesson: lesson.slug }, props: { lesson } }));
}

/** Every address the generated pages take, for tests and sweeps. */
export function generatedRoutes(catalog: Catalog): string[] {
  return catalog.lessons.flatMap((lesson) => [
    lesson.href,
    ...lesson.modes.filter((mode) => GENERATED_MODES.some((generated) => generated.id === mode.id)).map((mode) => mode.href),
  ]);
}

/** Small number words for the hub's "seven ways to practice this lesson". */
export function countInWords(count: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][count] ?? String(count);
}

/**
 * The id Astro's glob loader gives a content file: its path inside the collection folder without `.json`, each part
 * slugged the way Astro does it (github-slugger: lowercase, punctuation dropped, spaces to dashes). Used by tools that
 * read /content without Astro (tests/lessonroutes.ts, scripts/check-content.mjs), so they see the ids the build sees.
 */
export function contentEntryId(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/\.json$/i, '')
    .split('/')
    .map((part) => part.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-'))
    .join('/')
    .replace(/\/index$/, '');
}
