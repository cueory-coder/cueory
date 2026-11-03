/**
 * The list headings of the anatomy lab (Task 177): which concept of BodyParts3D's own hierarchy heads each structure.
 * Used by scripts/build-anatomy.mjs and tested in tests/unit/anatomy-models.test.ts. A heading is always a concept
 * from the hierarchy file, never a name made up here.
 *
 * Each structure has a path from one of its system's root concepts down to it (the build's breadth-first path). The
 * heading is the coarsest concept on that path that still makes a useful heading:
 *   - start at the root concept;
 *   - while that concept holds more than GROUP_SPLIT_ABOVE of the system's structures, go one step down the path, but
 *     only to a concept (never the structure itself) that holds at least GROUP_MIN of them;
 *   - a structure that is itself a root concept is headed by the nearest concept that holds every root of its system.
 * "Holds" counts the structures whose path passes through the concept, so a structure is counted under one heading only.
 */

/** A concept holding more structures than this is split into its parts on the path (when they are big enough). */
export const GROUP_SPLIT_ABOVE = 12;
/** A part becomes a heading only when it holds at least this many structures. */
export const GROUP_MIN = 3;

/**
 * Every concept above `id` in the hierarchy, nearest first (breadth-first up the tree, ties in file order).
 * @param {string} id
 * @param {Map<string, string[]>} parents concept id -> the concepts it is part of, in file order
 * @returns {string[]}
 */
export function ancestorsOf(id, parents) {
  const out = [];
  const seen = new Set([id]);
  const queue = [...(parents.get(id) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...(parents.get(next) ?? []));
  }
  return out;
}

/**
 * The nearest concept that every root concept of a system is part of, or undefined when they share none.
 * @param {string[]} roots
 * @param {Map<string, string[]>} parents
 * @returns {string | undefined}
 */
export function commonParent(roots, parents) {
  if (roots.length === 0) return undefined;
  const others = roots.slice(1).map((root) => new Set(ancestorsOf(root, parents)));
  return ancestorsOf(roots[0], parents).find((concept) => others.every((set) => set.has(concept)));
}

/**
 * The heading of every structure of one system.
 * @param {Array<{ id: string, path: string[] }>} structures path: concept ids from the root concept to the structure
 * @param {string[]} roots the system's root concept ids
 * @param {Map<string, string[]>} parents
 * @returns {Map<string, string>} structure id -> heading concept id
 */
export function groupHeadings(structures, roots, parents) {
  const holds = new Map();
  for (const { path } of structures) for (const step of path) holds.set(step, (holds.get(step) ?? 0) + 1);
  const top = commonParent(roots, parents);
  const out = new Map();
  for (const { id, path } of structures) {
    if (path.length === 1) {
      // The structure is a root concept itself: head it with what all the system's roots are part of (or, for a
      // system with one root, what that root is part of).
      const heading = top ?? ancestorsOf(id, parents)[0];
      if (!heading) throw new Error(`${id} is a root concept that is part of nothing in the hierarchy`);
      out.set(id, heading);
      continue;
    }
    let depth = 0;
    while (holds.get(path[depth]) > GROUP_SPLIT_ABOVE && depth + 2 < path.length && holds.get(path[depth + 1]) >= GROUP_MIN) {
      depth++;
    }
    out.set(id, path[depth]);
  }
  return out;
}
