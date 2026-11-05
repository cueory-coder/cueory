import type { StructureGroup } from './anatomylab';

/** One short page at a time keeps the whole-body list usable with a keyboard and on phones. */
export const STRUCTURE_PAGE_SIZE = 40;

/**
 * Limit the number of rendered structures across all groups (not per group).
 * Preserve the original order, keep only nonempty groups, and never mutate the source.
 */
export function visibleStructureGroups(groups: readonly StructureGroup[], limit: number): StructureGroup[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  let remaining = Math.floor(limit);
  const result: StructureGroup[] = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const items = group.items.slice(0, remaining);
    if (items.length === 0) continue;
    result.push({ group: group.group, items });
    remaining -= items.length;
  }
  return result;
}
