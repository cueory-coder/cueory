/** Read-only build status for each ID in the approved curriculum outline. */
import type { MapUnit } from '../islands/lessonmap';
import type { CatalogLesson } from './catalog';

export type CurriculumBuildLabel = 'built' | 'not built yet';
export interface CurriculumLessonStatus { id: string; status: CurriculumBuildLabel }
export interface CurriculumTopicStatus {
  id: string;
  title: string;
  lessons: CurriculumLessonStatus[];
  builtCount: number;
}
export interface CurriculumUnitStatus {
  id: string;
  title: string;
  topics: CurriculumTopicStatus[];
  lessonCount: number;
  builtCount: number;
}
export interface CurriculumSummary {
  units: CurriculumUnitStatus[];
  lessonCount: number;
  builtCount: number;
  /** Built catalog IDs missing from the map are a data mismatch, not a new planned lesson. */
  unmappedCatalogIds: string[];
}

/**
 * Match the public build catalog to the curriculum's lesson_id. Never copy
 * lesson text, private notes, or the map's internal review statuses into output.
 */
export function curriculumStatus(
  units: readonly MapUnit[],
  catalog: readonly Pick<CatalogLesson, 'curriculumId'>[],
): CurriculumSummary {
  const builtIds = new Set(catalog.map((lesson) => lesson.curriculumId).filter((id): id is string => Boolean(id)));
  const mappedIds = new Set<string>();
  let lessonCount = 0;
  let builtCount = 0;
  const resultUnits = units.map((unit) => {
    let unitLessonCount = 0;
    let unitBuiltCount = 0;
    const topics = unit.topics.map((topic) => {
      let topicBuiltCount = 0;
      const lessons = topic.lessons.map((lesson) => {
        mappedIds.add(lesson.lesson_id);
        const built = builtIds.has(lesson.lesson_id);
        lessonCount++;
        unitLessonCount++;
        if (built) {
          builtCount++;
          unitBuiltCount++;
          topicBuiltCount++;
        }
        return { id: lesson.lesson_id, status: built ? 'built' as const : 'not built yet' as const };
      });
      return { id: topic.id, title: topic.title, lessons, builtCount: topicBuiltCount };
    });
    return { id: unit.id, title: unit.title, topics, lessonCount: unitLessonCount, builtCount: unitBuiltCount };
  });
  return {
    units: resultUnits,
    lessonCount,
    builtCount,
    unmappedCatalogIds: [...builtIds].filter((id) => !mappedIds.has(id)).sort(),
  };
}

/** Extra safety for the curriculum outline: Cloudflare currently builds live from
 * legacy/main, while the shared drafts gate recognizes only main as production.
 * Never render the outline from either production branch or an unknown Workers branch.
 * This is build-time exclusion, NOT authentication for deployed preview URLs.
 */
export function curriculumPreviewAllowed(
  sharedDraftsAllowed: boolean,
  env: { readonly WORKERS_CI?: string | undefined; readonly WORKERS_CI_BRANCH?: string | undefined },
): boolean {
  if (!sharedDraftsAllowed) return false;
  if (env.WORKERS_CI !== '1') return true;
  const rawBranch = env.WORKERS_CI_BRANCH?.trim();
  if (!rawBranch) return false;
  const branch = rawBranch.startsWith('refs/heads/')
    ? rawBranch.slice('refs/heads/'.length)
    : rawBranch;
  return branch !== 'main' && branch !== 'legacy/main';
}
