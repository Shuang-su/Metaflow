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
} from "../../metaflow-viewer/src/navigation/contracts";
import type { WalkPhysicsState } from "../../metaflow-viewer/src/cameras/walk-controller";
import { repairCorridor, shortcutCorridor } from "./corridor";
export type Candidate = { point: Point; eye: Point; ref: number };
const complete = (status: number) =>
  !(
    status &
    (Detour.DT_PARTIAL_RESULT |
      Detour.DT_BUFFER_TOO_SMALL |
      Detour.DT_OUT_OF_NODES)
  );
export class NativePlanner {
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
  polygon(ref: number): Region {
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
    return {
      ref,
      vertices,
      floor: vertices.reduce((n, p) => n + p.y, 0) / vertices.length,
    };
  }
  associate(s: WalkPhysicsState) {
    if (s.supportHeight === null || s.collision !== "active") return null;
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
      if (clear) return { ref: p.ref, point: p.closestPoint, eye };
    }
    return null;
  }
  *candidates(goal: Goal) {
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
        if (eye) out.push({ point: p.closestPoint, eye, ref });
      }
      yield;
    }
    return out.sort(
      (a, b) =>
        horizontal(a.point, goal.camera) - horizontal(b.point, goal.camera),
    );
  }
  regions(
    goal: Goal,
    candidates: Candidate[],
    floorOverride?: number,
    seed?: Candidate | null,
  ) {
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
    const scored = groups
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
    const choices = scored.map((g) => ({ floor: g.floor, count: g.c.length }));
    let selected = scored[0];
    if (floorOverride !== undefined)
      selected = scored.reduce(
        (a, b) =>
          Math.abs(a.floor - floorOverride) < Math.abs(b.floor - floorOverride)
            ? a
            : b,
        scored[0],
      );
    else if (
      scored[1] &&
      Math.abs(scored[1].floor - scored[0].floor) > 0.6 &&
      scored[1].score - scored[0].score < 0.4
    )
      return { regions: [], candidates: [], choices, ambiguous: true };
    return {
      regions: selected
        ? Array.from(new Set(selected.c.map((c) => c.ref)), (ref) =>
            this.polygon(ref),
          )
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
  ) {
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
    );
    let r = proof.next();
    while (!r.done) {
      yield;
      r = proof.next();
    }
    return {
      ok: r.value.ok,
      reason: r.value.reason,
      point: { ...r.value.state.position },
    };
  }
  /** Detour start-corridor repair. Visited topology is merged with the ordered route. */
  *maintain(actual: WalkPhysicsState, route: Route, native: Candidate) {
    this.lastMaintenanceFailure = null;
    const fail = (reason: string) => {
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
    )
      return fail("surface-move-incomplete");
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
    const prefix = path.points.slice(0, Math.min(cut + 1, path.points.length));
    const check = yield* this.verify(actual, prefix);
    if (!check.ok) return fail(check.reason);
    return {
      route: {
        ...route,
        points: [
          { ...actual.position, y: actual.supportHeight! },
          ...path.points,
        ],
        polys,
        revision: route.revision + 1,
      },
      native: { ref, point, eye },
    };
  }
}
