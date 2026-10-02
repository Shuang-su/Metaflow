import type { NavigationTile } from "../../mf79-viewer-trial/src/tiles";

/** Resume records must be a unique subset of this exact job's geometric tile set. */
export function validateDayunResume(
  saved: any,
  fingerprint: string,
  expected: NavigationTile[],
) {
  if (saved.fingerprint !== fingerprint)
    throw Error(
      "Navigation job mismatch; choose a new explicit output version",
    );
  if (
    !["building", "complete", "analysis-complete"].includes(saved.status) ||
    !Array.isArray(saved.tiles)
  )
    throw Error("Invalid navigation resume record");
  const tiles = new Map(
    expected.map((tile) => [`tile-${tile.x}-${tile.z}`, tile]),
  );
  const seen = new Set<string>();
  for (const record of saved.tiles) {
    const tile = tiles.get(record.name);
    if (!tile || seen.has(record.name))
      throw Error("Unexpected or duplicate navigation resume tile");
    seen.add(record.name);
    if (
      record.x !== tile.x ||
      record.z !== tile.z ||
      (["min", "max"] as const).some((side) =>
        (["x", "y", "z"] as const).some(
          (axis) => record.bounds?.[side]?.[axis] !== tile.bounds[side][axis],
        ),
      )
    )
      throw Error("Navigation resume tile bounds mismatch");
    if (
      record.hash !== null &&
      (typeof record.hash !== "string" || !/^[0-9a-f]{64}$/.test(record.hash))
    )
      throw Error("Invalid navigation resume tile hash");
  }
  if (saved.status !== "building" && seen.size !== expected.length)
    throw Error("Completed navigation asset has missing tiles");
}
