/**
 * Ordered Detour corridor repair, extracted from the MF-79 Recast adapter at
 * 4b4eaaf5 (jev-guide-lab/src/recast-planner.ts). The furthest common visited
 * polygon consumes the travelled prefix. Choosing the first common polygon
 * would produce C,B,A,B,C,D when moving A -> B -> C along A,B,C,D.
 *
 * Repeated references have ambiguous occurrence identity. Re-query instead of
 * guessing an occurrence or preserving a corridor corrupted by an older client.
 */
export function repairCorridor(
  path: readonly number[],
  visited: readonly number[],
): number[] | null {
  if (!path.length || !visited.length || new Set(path).size !== path.length)
    return null;
  let pathIndex = -1;
  let visitedIndex = -1;
  for (let i = path.length - 1; i >= 0 && pathIndex < 0; i--) {
    for (let j = visited.length - 1; j >= 0; j--) {
      if (path[i] === visited[j]) {
        pathIndex = i;
        visitedIndex = j;
        break;
      }
    }
  }
  if (pathIndex < 0) return null;
  const result = [
    ...visited.slice(visitedIndex + 1).reverse(),
    ...path.slice(pathIndex),
  ];
  return new Set(result).size === result.length ? result : null;
}

/** Same forward-visited splice as Detour's visibility optimisation. */
export function shortcutCorridor(
  path: readonly number[],
  visited: readonly number[],
): number[] | null {
  if (!visited.length || new Set(path).size !== path.length) return null;
  // The ray must finish on this ordered corridor, not just pass near it in X/Z.
  const join = path.indexOf(visited.at(-1)!);
  if (join < 0) return null;
  const result = [...visited, ...path.slice(join + 1)];
  return new Set(result).size === result.length ? result : null;
}
