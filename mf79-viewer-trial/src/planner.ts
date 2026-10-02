import { Detour, NavMeshQuery, type NavMesh } from "recast-navigation";
import type { Point, Space } from "./types";
import {
  BODY,
  stand,
  support,
  proveRoute,
  horizontal,
  length,
} from "./native-motion";
import type {
  Goal,
  Region,
  Route,
  GroundChoice,
} from "../../metaflow-viewer/src/navigation/contracts";
import { SurfaceCatalogIndex } from "../../metaflow-viewer/src/navigation/layers";
import type {
  SurfaceCatalog,
  SupportAssociation,
} from "../../metaflow-viewer/src/navigation/layers";
import type { WalkPhysicsState } from "../../metaflow-viewer/src/cameras/walk-controller";
import {
  clipToArrival,
  routeLength,
} from "../../metaflow-viewer/src/navigation/contracts";
import { repairCorridor, shortcutCorridor } from "./corridor";
export type Candidate = {
  point: Point;
  eye: Point;
  ref: number;
  surfaceId?: string;
  layerId?: string;
};
const complete = (status: number) =>
  !(
    status &
    (Detour.DT_PARTIAL_RESULT |
      Detour.DT_BUFFER_TOO_SMALL |
      Detour.DT_OUT_OF_NODES)
  );
export class NativePlanner {
  private catalog: SurfaceCatalogIndex | null = null;
  private requiredCatalog = false;
  private associations = new Map<string, SupportAssociation>();
  setSurfaceCatalog(
    value: SurfaceCatalog | undefined,
    sourceHash: string,
    required = false,
  ) {
    this.requiredCatalog = required || !!value;
    this.catalog = value ? new SurfaceCatalogIndex(value, sourceHash) : null;
    if (this.requiredCatalog && !this.catalog)
      throw Error("Confirmed surface catalog missing");
    this.associations.clear();
    this.candidateCache.clear();
    this.verificationCache.clear();
  }
  setSupport(s: WalkPhysicsState, association?: SupportAssociation) {
    if (
      !this.catalog ||
      !association ||
      association.catalog !== this.catalog.fingerprint ||
      association.collisionFingerprint !==
        this.catalog.catalog.collisionFingerprint ||
      association.tick !== s.tick ||
      association.epoch !== s.epoch
    )
      return;
    this.associations.set(`${s.epoch}:${s.tick}`, association);
    if (this.associations.size > 128)
      this.associations.delete(this.associations.keys().next().value!);
  }
  decorateRoute(route: Route): Route {
    if (!this.catalog) {
      if (this.requiredCatalog)
        throw Error("Confirmed surface catalog missing");
      return route;
    }
    return { ...route, ...this.catalog.route(route.points) };
  }
  private candidateCache = new Map<string, Candidate[]>();
  candidateCacheHits = 0;
  verificationCacheHits = 0;
  private verificationCache = new Map<
    string,
    { ok: boolean; reason: string; point: Point }
  >();
  queryMetrics = {
    searched: 0,
    verified: 0,
    rejected: 0,
    searchMs: 0,
    verificationMs: 0,
  };
  recoveries = 0;
  lastRecovery: object | null = null;
  private topologyOrigin: {
    epoch: number;
    tick: number;
    point: Point;
    end: string;
  } | null = null;
  topologyChecks = 0;
  topologyChanges = 0;
  lastTopologyCheck: {
    before: number;
    after: number;
    accepted: boolean;
    reason: string;
  } | null = null;
  lastMaintenanceFailure: {
    reason: string;
    position: Point;
    supportHeight: number | null;
    nativeRef: number;
    revision: number;
  } | null = null;
  readonly query: NavMeshQuery;
  readonly localQuery: NavMeshQuery;
  constructor(
    readonly mesh: NavMesh,
    readonly space: Space,
    readonly asset: string,
  ) {
    this.query = new NavMeshQuery(mesh, { maxNodes: 65535 });
    this.localQuery = new NavMeshQuery(mesh, { maxNodes: 256 });
  }
  destroy() {
    this.query.destroy();
    this.localQuery.destroy();
  }
  polygon(ref: number, surfaceId?: string): Region {
    const r = this.mesh.getTileAndPolyByRef(ref);
    if (!r.success) throw Error("Obsolete surface reference");
    const vertices = Array.from({ length: r.poly.vertCount() }, (_, i) => {
      const n = r.poly.verts(i) * 3;
      return {
        x: r.tile.verts(n),
        y: r.tile.verts(n + 1),
        z: r.tile.verts(n + 2),
      };
    });
    const surface = surfaceId
      ? this.catalog?.surfaces.get(surfaceId)
      : undefined;
    const clipped = surface
      ? this.catalog!.clip(vertices, surface.id)
      : vertices;
    return {
      ref,
      vertices: clipped,
      floor: clipped.reduce((n, p) => n + p.y, 0) / clipped.length,
      ...(surface?.kind === "floor"
        ? {
            surfaceId: surface.id,
            layerId: surface.layerId,
            catalog: this.catalog!.fingerprint,
            asset: this.asset,
          }
        : {}),
    };
  }
  associate(s: WalkPhysicsState) {
    if (s.supportHeight === null || s.collision !== "active") return null;
    const association = this.associations.get(`${s.epoch}:${s.tick}`);
    if (
      this.requiredCatalog &&
      (!this.catalog ||
        !association?.surfaceId ||
        !["confirmed", "transition"].includes(association.status))
    )
      return null;
    const foot = { ...s.position, y: s.supportHeight },
      r = this.query.queryPolygons(
        foot,
        { x: 0.32, y: 0.28, z: 0.32 },
        { maxPolys: 4096 },
      );
    if (!r.success || !complete(r.status))
      throw Error("Navigation surface query buffer exhausted");
    const candidates = r.polyRefs
      .map((ref) => ({ ref, ...this.query.closestPointOnPoly(ref, foot) }))
      .filter(
        (v) =>
          v.success &&
          horizontal(v.closestPoint, foot) <= 0.32 &&
          Math.abs(v.closestPoint.y - foot.y) <= 0.28,
      )
      .sort(
        (a, b) => length(a.closestPoint, foot) - length(b.closestPoint, foot),
      );
    for (const p of candidates) {
      const surface = this.catalog?.unique(p.closestPoint);
      if (this.catalog && (!surface || surface.id !== association?.surfaceId))
        continue;
      const eye = stand(this.space.collision, p.closestPoint);
      if (!eye) continue;
      // Real connection, not a teleport. Short proof is resumed by the caller for routes.
      const dist = horizontal(eye, s.position);
      let clear = true;
      for (let i = 0; i <= Math.ceil(dist / 0.04); i++) {
        const t = dist ? Math.min(1, (i * 0.04) / dist) : 0,
          e = {
            x: s.position.x + (eye.x - s.position.x) * t,
            y: s.position.y + (eye.y - s.position.y) * t,
            z: s.position.z + (eye.z - s.position.z) * t,
          },
          out = { x: 0, y: 0, z: 0 };
        if (
          this.space.collision.queryCapsule(
            e.x,
            e.y - BODY.eye + BODY.height / 2,
            e.z,
            BODY.height / 2 - BODY.radius,
            BODY.radius,
            out,
          )
        ) {
          clear = false;
          break;
        }
      }
      if (clear)
        return {
          ref: p.ref,
          point: p.closestPoint,
          eye,
          ...(surface
            ? {
                surfaceId: surface.id,
                ...(surface.kind === "floor"
                  ? { layerId: surface.layerId }
                  : {}),
              }
            : {}),
        };
    }
    return null;
  }
  *candidates(goal: Goal): Generator<void, Candidate[], unknown> {
    const cacheKey = JSON.stringify([
      this.asset,
      BODY,
      goal.camera,
      goal.radius,
      goal.surfaceId,
      this.catalog?.fingerprint,
    ]);
    const cached = this.candidateCache.get(cacheKey);
    if (cached) {
      this.candidateCacheHits++;
      return cached;
    }
    const seen = new Set<string>(),
      out: Candidate[] = [];
    const r = goal.radius;
    // Query all heights at each x/z sample, so a cabinet top cannot mask the actual floor.
    const offsets: Point[] = [{ x: 0, y: 0, z: 0 }];
    for (let x = -r; x <= r; x += 0.32)
      for (let z = -r; z <= r; z += 0.32)
        if (Math.hypot(x, z) <= r) offsets.push({ x, y: 0, z });
    for (const offset of offsets) {
      const sample = {
        x: goal.camera.x + offset.x,
        y: (this.space.bounds.min.y + this.space.bounds.max.y) / 2,
        z: goal.camera.z + offset.z,
      };
      const found = this.query.queryPolygons(
        sample,
        {
          x: 0.16,
          y: (this.space.bounds.max.y - this.space.bounds.min.y) / 2 + 0.1,
          z: 0.16,
        },
        { maxPolys: 8192 },
      );
      if (!found.success || !complete(found.status))
        throw Error("Target query capacity exhausted");
      for (const ref of found.polyRefs) {
        const p = this.query.closestPointOnPoly(ref, sample);
        if (!p.success || horizontal(p.closestPoint, goal.camera) > r) continue;
        const key = `${ref}:${p.closestPoint.x}:${p.closestPoint.y}:${p.closestPoint.z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const eye = stand(this.space.collision, p.closestPoint);
        const surface = this.catalog?.unique(p.closestPoint);
        if (
          this.catalog &&
          (surface?.kind !== "floor" ||
            (goal.surfaceId && goal.surfaceId !== surface.id))
        )
          continue;
        if (eye)
          out.push({
            point: p.closestPoint,
            eye,
            ref,
            ...(surface?.kind === "floor"
              ? { surfaceId: surface.id, layerId: surface.layerId }
              : {}),
          });
      }
      yield;
    }
    this.candidateCache.set(cacheKey, out);
    // Finite cache storage does not impose a navigation retry limit.
    if (this.candidateCache.size > 134)
      this.candidateCache.delete(this.candidateCache.keys().next().value!);
    return out;
  }
  regions(
    goal: Goal,
    candidates: Candidate[],
    floorOverride?: number | string,
    seed?: Candidate | null,
  ): {
    regions: Region[];
    candidates: Candidate[];
    choices: GroundChoice[];
    ambiguous: boolean;
  } {
    const refs = new Set(candidates.map((c) => c.ref)),
      groups: Candidate[][] = [];
    while (refs.size) {
      const seed = refs.values().next().value!,
        group = new Set<number>(),
        stack = [seed];
      refs.delete(seed);
      while (stack.length) {
        const ref = stack.pop()!;
        group.add(ref);
        const r = this.mesh.getTileAndPolyByRef(ref);
        if (!r.success) continue;
        for (let n = r.poly.firstLink(); n !== 4294967295 && n !== -1;) {
          const link = r.tile.links(n);
          n = link.next();
          const next = link.ref();
          if (!refs.has(next)) continue;
          const edge = link.edge(),
            a = r.poly.verts(edge) * 3,
            b = r.poly.verts((edge + 1) % r.poly.vertCount()) * 3;
          const ax = r.tile.verts(a),
            az = r.tile.verts(a + 2),
            dx = r.tile.verts(b) - ax,
            dz = r.tile.verts(b + 2) - az;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((goal.camera.x - ax) * dx + (goal.camera.z - az) * dz) /
                (dx * dx + dz * dz || 1),
            ),
          );
          if (
            Math.hypot(
              ax + t * dx - goal.camera.x,
              az + t * dz - goal.camera.z,
            ) > goal.radius
          )
            continue;
          refs.delete(next);
          stack.push(next);
        }
      }
      groups.push(candidates.filter((c) => group.has(c.ref)));
    }
    const grouped = this.catalog
      ? groups.flatMap((group) =>
          [...new Set(group.map((c) => c.layerId))].map((layer) =>
            group.filter((c) => c.layerId === layer),
          ),
        )
      : groups;
    const scored = grouped
      .map((c) => {
        const floor = c.map((p) => p.point.y).sort((a, b) => a - b)[
          Math.floor(c.length / 2)
        ];
        return {
          c,
          floor,
          score:
            Math.abs(goal.camera.y - (floor + BODY.eye + BODY.hover)) +
            0.25 * horizontal(c[0].point, goal.camera),
        };
      })
      .sort((a, b) => a.score - b.score);
    // A tabletop can fit a standing capsule but have no ordinary walking connection.
    // Prefer surfaces connected to the current native surface; preserve disconnected
    // alternatives for explicit diagnosis instead of declaring the marker unreachable.
    if (seed) {
      const connected = scored.filter(
        (g) => this.path(seed, g.c[0]).reason === "complete",
      );
      if (connected.length) {
        const disconnected = scored.filter((g) => !connected.includes(g));
        scored.splice(
          0,
          scored.length,
          ...connected,
          ...disconnected.map((g) => ({ ...g, score: g.score + 100 })),
        );
      }
    }
    const choices = scored.map((g) => ({
      floor: g.floor,
      count: g.c.length,
      ...(this.catalog
        ? {
            surfaceId: g.c[0].surfaceId,
            label: this.catalog.catalog.layers.find(
              (l) => l.id === g.c[0].layerId,
            )?.label,
          }
        : {}),
    }));
    let selected = scored[0];
    if (typeof floorOverride === "string")
      selected = scored.find((g) =>
        g.c.some((c) => c.surfaceId === floorOverride),
      )!;
    else if (floorOverride !== undefined && !this.catalog)
      selected = scored.reduce(
        (a, b) =>
          Math.abs(a.floor - floorOverride) < Math.abs(b.floor - floorOverride)
            ? a
            : b,
        scored[0],
      );
    else if (this.catalog && scored.length > 1 && !goal.surfaceId) {
      return { regions: [], candidates: [], choices, ambiguous: true };
    } else if (
      !this.catalog &&
      scored[1] &&
      Math.abs(scored[1].floor - scored[0].floor) > 0.6 &&
      scored[1].score - scored[0].score < 0.4
    )
      return { regions: [], candidates: [], choices, ambiguous: true };
    return {
      regions: selected
        ? Array.from(
            new Map(
              selected.c.map((c) => [`${c.ref}:${c.surfaceId ?? ""}`, c]),
            ).values(),
            (c) => this.polygon(c.ref, c.surfaceId),
          ).filter((r) => r.vertices.length >= 3)
        : [],
      candidates: selected?.c ?? [],
      choices: [],
      ambiguous: false,
    };
  }
  path(start: Candidate, end: Candidate, query = this.query) {
    const r = query.findPath(start.ref, end.ref, start.point, end.point, {
      maxPathPolys: 32768,
    });
    try {
      if (!r.success)
        return { reason: "native-search-error", polys: [], points: [] };
      if (!complete(r.status))
        return {
          reason:
            r.status & Detour.DT_OUT_OF_NODES
              ? "native-node-capacity"
              : r.status & Detour.DT_BUFFER_TOO_SMALL
                ? "native-buffer-capacity"
                : "partial",
          polys: [],
          points: [],
        };
      const polys = Array.from({ length: r.polys.size }, (_, i) =>
        r.polys.get(i),
      );
      if (polys.at(-1) !== end.ref)
        return { reason: "partial", polys: [], points: [] };
      return this.straight(start.point, end.point, polys);
    } finally {
      r.polys.destroy();
    }
  }
  straight(start: Point, end: Point, polys: number[]) {
    const r = this.query.findStraightPath(start, end, polys, {
      maxStraightPathPoints: 32768,
      straightPathOptions: 2,
    });
    try {
      if (!r.success || !complete(r.status))
        return { reason: "native-straight-capacity", polys: [], points: [] };
      const points = Array.from({ length: r.straightPathCount }, (_, i) => ({
        x: r.straightPath.get(i * 3),
        y: r.straightPath.get(i * 3 + 1),
        z: r.straightPath.get(i * 3 + 2),
      }));
      return { reason: "complete", polys, points };
    } finally {
      r.straightPath.destroy();
      r.straightPathFlags.destroy();
      r.straightPathRefs.destroy();
    }
  }
  *verify(
    from: WalkPhysicsState,
    groundPoints: Point[],
    finalTolerance = 0.07,
    arrivalRegion?: { goal: Goal; regions: Region[] },
  ): Generator<void, { ok: boolean; reason: string; point: Point }, unknown> {
    // Exact coordinates, direction, surface and body state: no quantised safety hits.
    const key = JSON.stringify([
      this.asset,
      BODY,
      from,
      groundPoints,
      finalTolerance,
      arrivalRegion,
    ]);
    const cached = this.verificationCache.get(key);
    if (cached) {
      this.verificationCacheHits++;
      return cached;
    }
    const eyes: Point[] = [{ ...from.position }];
    for (const point of groundPoints) {
      const eye = stand(this.space.collision, point);
      if (!eye)
        return { ok: false, reason: "native-support-or-clearance", point };
      eyes.push(eye);
      yield;
    }
    const proof = proveRoute(
      this.space.collision,
      from.position,
      eyes,
      finalTolerance,
      arrivalRegion,
    );
    let r = proof.next();
    while (!r.done) {
      yield;
      r = proof.next();
    }
    const result = {
      ok: r.value.ok,
      reason: r.value.reason,
      point: { ...r.value.state.position },
    };
    if (result.ok) {
      this.verificationCache.set(key, result);
      if (this.verificationCache.size > 64)
        this.verificationCache.delete(
          this.verificationCache.keys().next().value!,
        );
    }
    return result;
  }
  toArrival(
    path: ReturnType<NativePlanner["path"]>,
    goal: Goal,
    regions: Region[],
  ) {
    const clipped = clipToArrival(path.points, goal, regions);
    if (!clipped) return null;
    const index = path.polys.indexOf(clipped.ref);
    if (index < 0) return null;
    let annotated;
    try {
      annotated = this.catalog?.route(clipped.points);
    } catch {
      return null;
    }
    return {
      ...path,
      points: annotated?.points ?? clipped.points,
      surfaces: annotated?.surfaces,
      catalog: annotated?.catalog,
      polys: path.polys.slice(0, index + 1),
      entry: clipped.entry,
      stopRoom: clipped.points.length === 1 || clipped.insetLength >= 0.079,
    };
  }
  /** Distance lower bounds order the work; complete path lengths order each verification batch. */
  *solutions(
    actual: WalkPhysicsState,
    goal: Goal,
    candidates: Candidate[],
    regions: Region[],
  ) {
    this.queryMetrics = {
      searched: 0,
      verified: 0,
      rejected: 0,
      searchMs: 0,
      verificationMs: 0,
    };
    const start = this.associate(actual);
    if (!start) return;
    const ordered = [...candidates].sort(
      (a, b) =>
        horizontal(a.point, actual.position) -
        horizontal(b.point, actual.position),
    );
    const seen = new Set<string>();
    let best = Infinity;
    const limitedRoom: NonNullable<ReturnType<NativePlanner["toArrival"]>>[] =
      [];
    for (let i = 0; i < ordered.length; i += 16) {
      const batch: NonNullable<ReturnType<NativePlanner["toArrival"]>>[] = [];
      for (const candidate of ordered.slice(i, i + 16)) {
        const searchAt = performance.now();
        const raw = this.path(start, candidate);
        this.queryMetrics.searched++;
        this.queryMetrics.searchMs += performance.now() - searchAt;
        yield;
        if (raw.reason.includes("capacity")) throw Error(raw.reason);
        if (raw.reason !== "complete") continue;
        raw.points = [
          { ...actual.position, y: actual.supportHeight! },
          ...raw.points,
        ];
        const path = this.toArrival(raw, goal, regions);
        if (!path || routeLength(path.points) >= best - 0.02) continue;
        const key = JSON.stringify(path.points);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!path.stopRoom) limitedRoom.push(path);
        else batch.push(path);
      }
      batch.sort((a, b) => routeLength(a.points) - routeLength(b.points));
      for (const path of batch) {
        if (routeLength(path.points) >= best - 0.02) continue;
        const verificationAt = performance.now();
        const proof = yield* this.verify(actual, path.points, 0.07, {
          goal,
          regions,
        });
        this.queryMetrics.verified++;
        this.queryMetrics.verificationMs += performance.now() - verificationAt;
        if (!proof.ok) {
          this.queryMetrics.rejected++;
          continue;
        }
        best = routeLength(path.points);
        yield { path, proof, start };
      }
    }
    // Eight centimetres of interior is a stopping preference, never a geometry
    // rejection. A thin eligible interval still gets native arrival verification
    // when no roomier route passed; no radius expansion or forced position.
    if (best === Infinity)
      for (const path of limitedRoom.sort(
        (a, b) => routeLength(a.points) - routeLength(b.points),
      )) {
        const at = performance.now();
        const proof = yield* this.verify(actual, path.points, 0.07, {
          goal,
          regions,
        });
        this.queryMetrics.verified++;
        this.queryMetrics.verificationMs += performance.now() - at;
        if (!proof.ok) {
          this.queryMetrics.rejected++;
          continue;
        }
        yield { path, proof, start };
        return;
      }
  }
  /** Recover a failed surface move from a newly verified association, never moving the visitor. */
  *recover(
    actual: WalkPhysicsState,
    route: Route,
    reason: string,
    native: Candidate,
  ) {
    const failure = { reason, actual, route, native };
    const start = this.associate(actual),
      endpoint = route.points.at(-1)!;
    if (!start) return null;
    const eye = stand(this.space.collision, endpoint);
    if (!eye) return null;
    const fresh = this.path(start, {
      ref: route.polys.at(-1)!,
      point: endpoint,
      eye,
    });
    yield;
    if (fresh.reason !== "complete") return null;
    const proof = yield* this.verify(actual, fresh.points);
    this.lastRecovery = { ...failure, proof, recovered: proof.ok };
    if (!proof.ok) return null;
    this.recoveries++;
    let rebuilt: Route;
    try {
      rebuilt = this.decorateRoute({
        ...route,
        points: [
          { ...actual.position, y: actual.supportHeight! },
          ...fresh.points,
        ],
        polys: fresh.polys,
        revision: route.revision + 1,
      });
    } catch {
      return null;
    }
    return {
      route: rebuilt,
      native: start,
    };
  }
  /** Detour start-corridor repair. Visited topology is merged with the ordered route. */
  *maintain(actual: WalkPhysicsState, route: Route, native: Candidate) {
    this.lastMaintenanceFailure = null;
    this.lastRecovery = null;
    const fail = (reason: string): null => {
      this.lastMaintenanceFailure = {
        reason,
        position: { ...actual.position },
        supportHeight: actual.supportHeight,
        nativeRef: native.ref,
        revision: route.revision,
      };
      return null;
    };
    const associated = this.associate(actual);
    if (!associated) return fail("native-surface-association");
    const moved = this.query.moveAlongSurface(
      native.ref,
      native.point,
      associated.point,
      { maxVisitedSize: 256 },
    );
    if (
      !moved.success ||
      !complete(moved.status) ||
      horizontal(moved.resultPosition, associated.point) > 0.04
    ) {
      const recovered = yield* this.recover(
        actual,
        route,
        "surface-move-incomplete",
        native,
      );
      return recovered ?? fail("surface-move-incomplete");
    }
    const ref = moved.visited.at(-1);
    if (ref === undefined) return fail("surface-move-empty");
    const height = this.query.getPolyHeight(ref, moved.resultPosition);
    const edge = !height.success
      ? this.query.closestPointOnPoly(ref, moved.resultPosition)
      : null;
    if (
      edge?.success &&
      length(edge.closestPoint, moved.resultPosition) <= 0.001
    ) {
      height.success = true;
      height.height = edge.closestPoint.y;
    }
    if (!height.success || Math.abs(height.height - associated.point.y) > 0.28)
      return fail("surface-height-mismatch");
    // Reuse the prior adapter's furthest-common-polygon repair. Only actual
    // moveAlongSurface topology can consume progress; never a nearest X/Z match.
    let polys = repairCorridor(route.polys, moved.visited);
    if (!polys) return fail("corridor-occurrence-or-connection");
    const point = { ...moved.resultPosition, y: height.height },
      eye = stand(this.space.collision, point);
    if (!eye) return fail("native-support-or-clearance");
    let path = this.straight(point, route.points.at(-1)!, polys);
    if (path.reason !== "complete") return fail(path.reason);
    // Retaining the corridor alone can preserve an obsolete detour after a
    // visitor changes sides. Detour raycast proves a same-surface local shortcut;
    // native walking must then prove it physically. This does not move the user.
    const arc = [0];
    for (let i = 1; i < path.points.length; i++)
      arc.push(arc[i - 1] + horizontal(path.points[i - 1], path.points[i]));
    for (let i = path.points.length - 1; i > 1; i--) {
      const anchor = path.points[i],
        direct = horizontal(point, anchor);
      if (direct > 4 || arc[i] - direct < 0.1) continue;
      const ray = this.query.raycast(ref, point, anchor);
      yield;
      let connection =
        ray.success && complete(ray.status) && ray.t >= 1 && ray.path.length
          ? ray.path
          : null;
      // A tiny convex corner can block a ray even when an equally short walking
      // connection exists. Query a bounded native local prefix to the same
      // forward anchor; capacity exhaustion merely declines this optimisation.
      if (!connection) {
        const nearby = this.query.queryPolygons(
          anchor,
          { x: 0.04, y: 0.28, z: 0.04 },
          { maxPolys: 128 },
        );
        if (!nearby.success || !complete(nearby.status)) continue;
        const anchors = nearby.polyRefs
          .filter((r) => polys!.includes(r))
          .map((ref) => ({
            ref,
            ...this.query.closestPointOnPoly(ref, anchor),
          }))
          .filter(
            (r) =>
              r.success &&
              horizontal(r.closestPoint, anchor) < 0.001 &&
              Math.abs(r.closestPoint.y - anchor.y) < 0.28,
          );
        for (const end of anchors) {
          const candidate = {
            ref: end.ref,
            point: end.closestPoint,
            eye: stand(this.space.collision, end.closestPoint),
          };
          if (!candidate.eye) continue;
          const local = this.path(
            { ref, point, eye },
            candidate as Candidate,
            this.localQuery,
          );
          yield;
          if (local.reason !== "complete") continue;
          const distance = local.points
            .slice(1)
            .reduce((n, p, j) => n + horizontal(local.points[j], p), 0);
          if (distance > 4 || distance >= arc[i] - 0.1) continue;
          connection = local.polys;
          break;
        }
      }
      if (!connection) continue;
      // Detour raycast ignores target Y. Explicitly check the reached surface
      // before accepting a shortcut, including overlapping-floor cases.
      const endRef = connection.at(-1)!,
        surface = this.query.closestPointOnPoly(endRef, anchor);
      if (
        !surface.success ||
        horizontal(surface.closestPoint, anchor) > 0.001 ||
        Math.abs(surface.closestPoint.y - anchor.y) > 0.28
      )
        continue;
      const shortened = shortcutCorridor(polys, connection);
      if (!shortened) continue;
      const front = this.straight(point, anchor, connection);
      if (front.reason !== "complete") continue;
      const verified = yield* this.verify(actual, front.points);
      if (!verified.ok) continue;
      polys = shortened;
      path = {
        reason: "complete",
        polys,
        points: [...front.points, ...path.points.slice(i + 1)],
      };
      break;
    }
    // Local visibility repair cannot change a distant obsolete passage. Reuse
    // Detour for a topology check to the SAME verified endpoint after meaningful
    // movement, not a candidate search on every pose. Keep the usable old route
    // while the replacement's complete native-motion proof yields in the Worker.
    const endpoint = path.points.at(-1)!,
      endRef = polys.at(-1)!;
    const endKey = `${endRef}:${endpoint.x}:${endpoint.y}:${endpoint.z}`;
    const prior = this.topologyOrigin;
    if (
      !prior ||
      prior.epoch !== actual.epoch ||
      prior.end !== endKey ||
      (actual.tick - prior.tick >= 60 && horizontal(point, prior.point) >= 1)
    ) {
      this.topologyOrigin = {
        epoch: actual.epoch,
        tick: actual.tick,
        point: { ...point },
        end: endKey,
      };
      this.topologyChecks++;
      const before = path.points
        .slice(1)
        .reduce((sum, p, i) => sum + horizontal(path.points[i], p), 0);
      const endEye = stand(this.space.collision, endpoint);
      if (endEye) {
        const fresh = this.path(
          { ref, point, eye },
          { ref: endRef, point: endpoint, eye: endEye },
        );
        yield;
        const after = fresh.points
          .slice(1)
          .reduce((sum, p, i) => sum + horizontal(fresh.points[i], p), 0);
        this.lastTopologyCheck = {
          before,
          after,
          accepted: false,
          reason: fresh.reason,
        };
        if (
          fresh.reason === "complete" &&
          new Set(fresh.polys).size === fresh.polys.length &&
          before - after >= 2 &&
          after <= before * 0.85
        ) {
          const proof = yield* this.verify(actual, fresh.points);
          this.lastTopologyCheck.reason = proof.reason;
          if (proof.ok) {
            polys = fresh.polys;
            path = fresh;
            this.topologyChanges++;
            this.lastTopologyCheck.accepted = true;
          }
        }
      }
    }
    let distance = 0,
      cut = 1;
    for (; cut < path.points.length; cut++) {
      distance += length(path.points[cut - 1], path.points[cut]);
      if (distance >= 4) break;
    }
    // If the changed prefix rejoins an exact forward suffix, keep the suffix's
    // existing proof. Include one shared edge to prove the changed approach/turn.
    // Reverse travel and a merely nearby line are never cache hits.
    for (let i = 1; i < Math.min(cut, path.points.length); i++) {
      const tail = path.points.slice(i);
      const oldIndex = route.points.length - tail.length;
      if (oldIndex < 1) continue;
      if (
        tail.every(
          (p, j) =>
            JSON.stringify(p) === JSON.stringify(route.points[oldIndex + j]),
        )
      ) {
        cut = Math.min(cut, i + 1);
        break;
      }
    }
    const prefix = path.points.slice(0, Math.min(cut + 1, path.points.length));
    const check = yield* this.verify(actual, prefix);
    if (!check.ok) return fail(check.reason);
    let rebuilt: Route;
    try {
      rebuilt = this.decorateRoute({
        ...route,
        points: [
          { ...actual.position, y: actual.supportHeight! },
          ...path.points,
        ],
        polys,
        revision: route.revision + 1,
      });
    } catch {
      return fail("unconfirmed-surface-route");
    }
    return {
      route: rebuilt,
      native: { ref, point, eye },
    };
  }
}
