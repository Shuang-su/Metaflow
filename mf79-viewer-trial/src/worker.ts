import { CooperativeWork } from "./scheduler";
import { init, importNavMesh } from "recast-navigation";
import { VoxelCollision } from "../../metaflow-viewer/src/collision/voxel-collision";
import { NativePlanner, type Candidate } from "./planner";
import { length, horizontal } from "./native-motion";
import type {
  Goal,
  Route,
  Region,
} from "../../metaflow-viewer/src/navigation/contracts";
import type { WalkPhysicsState } from "../../metaflow-viewer/src/cameras/walk-controller";
let planner: NativePlanner,
  asset = "",
  session = 0,
  goal: Goal | null = null,
  actual: WalkPhysicsState | null = null,
  route: Route | null = null,
  native: Candidate | null = null;
let paused = false,
  arrived = false,
  floorOverride: number | undefined;
let regions: Region[] = [];
let candidates: Candidate[] | null = null,
  queries = 0,
  revision = 0,
  lastEvidence = "";
const send = (data: object) => postMessage({ session, ...data });
const identity = (s: WalkPhysicsState) =>
  JSON.stringify([s.position, s.supportHeight, s.collision, goal, asset]);
const work = new CooperativeWork((error) =>
  send({
    type: "error",
    taskState: "error",
    message: `导航运行错误：${String(error)}，移动后可重试`,
  }),
);
function install(generator: Generator, _name: string) {
  work.replace(generator);
}
function* prepare() {
  if (!goal) return;
  const start = performance.now(),
    all = yield* planner.candidates(goal),
    region = planner.regions(
      goal,
      all,
      floorOverride,
      actual ? planner.associate(actual) : null,
    );
  candidates = region.candidates;
  regions = region.regions;
  send({
    type: "region",
    taskState: region.ambiguous
      ? "floor"
      : candidates.length
        ? "computing"
        : "exhausted",
    regions: region.regions,
    choices: region.choices,
    message: region.ambiguous
      ? "目标地面待确认，请在地图中选择"
      : !candidates.length
        ? "保存相机附近尚未生成可站立表面；仍可自由行走"
        : undefined,
    timing: { candidateMs: performance.now() - start },
  });
  if (candidates.length) yield* globalQuery(start);
}
function* globalQuery(begin = performance.now()) {
  if (!actual || !goal || !candidates?.length || arrived) return;
  queries++;
  if (!route)
    send({
      type: "progress",
      taskState: "computing",
      message: "正在从当前位置寻找路线",
    });
  const origin = actual;
  const start = planner.associate(origin);
  if (!start) {
    lastEvidence = identity(actual);
    send({
      type: "exhausted",
      message: "当前位置尚未接入导航表面；请继续行走，落地后自动重查",
    });
    return;
  }
  let found = false,
    firstCompleteMs: number | null = null;
  for (const solution of planner.solutions(origin, goal, candidates, regions)) {
    yield;
    if (arrived) return;
    // A moving visitor takes priority over background candidate optimisation.
    if (
      route &&
      actual &&
      horizontal(actual.position, origin.position) > 0.05
    ) {
      install(maintain(), "local");
      return;
    }
    if (!solution) continue;
    const path = solution.path;
    let proposed: Route = {
      points: path.points,
      polys: path.polys,
      asset,
      revision: ++revision,
    };
    let position = start,
      verifiedOrigin = origin;
    if (actual && length(actual.position, origin.position) > 0.02) {
      verifiedOrigin = actual;
      const maintained = yield* planner.maintain(
        verifiedOrigin,
        proposed,
        start,
      );
      if (!maintained) {
        install(globalQuery(), "global");
        return;
      }
      proposed = maintained.route;
      position = maintained.native;
    }
    if (
      actual &&
      (actual.epoch !== verifiedOrigin.epoch ||
        !actual.grounded ||
        actual.collision !== "active" ||
        horizontal(actual.position, verifiedOrigin.position) > 0.05)
    ) {
      route = proposed;
      native = position;
      if (actual.grounded && actual.collision === "active")
        install(maintain(), "local");
      return;
    }
    if (route) {
      const distance = (r: Route) =>
        r.points.slice(1).reduce((n, p, i) => n + length(r.points[i], p), 0);
      const before = distance(route),
        after = distance(proposed);
      const same = proposed.polys.every((p, i) => route!.polys[i] === p);
      if (!same && (before - after < 2 || after > before * 0.85)) continue;
    }
    route = proposed;
    native = position;
    found = true;
    firstCompleteMs ??= performance.now() - begin;
    lastEvidence = actual ? identity(actual) : "";
    send({
      type: "route",
      taskState: "route",
      route,
      timing: {
        totalMs: performance.now() - begin,
        firstCompleteMs,
        ...planner.queryMetrics,
        queries,
        candidateCacheHits: planner.candidateCacheHits,
        verificationCacheHits: planner.verificationCacheHits,
      },
    });
  }
  if (found || route) return;
  if (actual && identity(actual) !== identity(origin)) {
    // Candidate exhaustion belongs to its queried start, not the new pose.
    install(globalQuery(), "global");
    return;
  }
  lastEvidence = actual ? identity(actual) : "";
  route = null;
  native = null;
  send({
    type: "exhausted",
    taskState: "exhausted",
    message:
      "本轮候选已检查完，尚未找到原版正常步行验证通过的路线；移动后继续寻找",
    timing: {
      totalMs: performance.now() - begin,
      ...planner.queryMetrics,
      queries,
    },
  });
}
function* maintain() {
  if (!actual || !route || !native) return;
  const at = performance.now(),
    origin = actual;
  const result = yield* planner.maintain(origin, route, native);
  if (result) {
    // Coalesce further motion. Do not overwrite a route with a stale actual start.
    if (
      actual &&
      (actual.epoch !== origin.epoch ||
        !actual.grounded ||
        actual.collision !== "active" ||
        horizontal(actual.position, origin.position) > 0.05)
    ) {
      route = result.route;
      native = result.native;
      if (actual.grounded && actual.collision === "active")
        install(maintain(), "local");
      return;
    }
    route = result.route;
    native = result.native;
    lastEvidence = identity(actual);
    send({
      type: "route",
      taskState: "route",
      route,
      timing: {
        localMs: performance.now() - at,
        topologyChecks: planner.topologyChecks,
        topologyChanges: planner.topologyChanges,
      },
      topology: planner.lastTopologyCheck,
      recovery: planner.lastRecovery,
      recoveries: planner.recoveries,
    });
  } else {
    route = null;
    native = null;
    send({
      type: "progress",
      taskState: "computing",
      invalidRoute: true,
      message: "正在从当前位置重新寻找路线",
      failure: planner.lastMaintenanceFailure,
    });
    yield* globalQuery();
  }
}
async function boot(data: any) {
  await init();
  const bytes = async (name: string, hash: string) => {
    const r = await fetch(new URL(name, data.base));
    if (!r.ok) throw Error("Navigation coverage missing: " + name);
    const b = await r.arrayBuffer();
    const h = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    if (h !== hash) throw Error("Asset fingerprint mismatch: " + name);
    return b;
  };
  const m = data.manifest,
    [nav, collision] = await Promise.all([
      bytes("nav.bin", m.navHash),
      bytes("collision.bin", m.collisionHash),
    ]);
  const words = new Uint32Array(collision),
    n = m.meta.nodeWordCount ?? m.meta.nodeCount;
  const c = new VoxelCollision(m.meta, words.slice(0, n), words.slice(n));
  asset = m.fingerprint;
  const mesh = importNavMesh(new Uint8Array(nav)).navMesh;
  planner = new NativePlanner(
    mesh,
    {
      collision: c,
      bounds: m.bounds,
      known: (x, y, z) =>
        ["x", "y", "z"].every(
          (k, i) =>
            [x, y, z][i] >= m.bounds.min[k] && [x, y, z][i] < m.bounds.max[k],
        ),
    },
    asset,
  );
  send({ type: "ready" });
}
onmessage = ({ data }) => {
  if (data.type === "init") {
    boot(data).catch((e) => send({ type: "error", message: String(e) }));
    return;
  }
  if (data.type === "pause") {
    paused = data.paused;
    work.setPaused(paused);
    return;
  }
  if (data.type === "cancel") {
    if (data.session === session) {
      work.replace(undefined);
      goal = null;
      route = null;
      native = null;
      regions = [];
      candidates = null;
    }
    postMessage({ type: "cancelled", session: data.session });
    return;
  }
  if (data.type === "goal") {
    session = data.session;
    goal = data.goal;
    actual = data.actual;
    route = null;
    native = null;
    arrived = false;
    floorOverride = undefined;
    regions = [];
    candidates = null;
    lastEvidence = "";
    send({ type: "progress", taskState: "computing" });
    install(prepare(), "global");
    return;
  }
  if (data.session !== session) return;
  if (data.type === "floor") {
    floorOverride = data.floor;
    route = null;
    native = null;
    send({ type: "progress", taskState: "computing" });
    install(prepare(), "global");
    return;
  }
  if (data.type === "arrived") {
    arrived = true;
    work.replace(undefined);
    route = null;
    return;
  }
  if (data.type === "pose") {
    actual = data.actual;
    if (
      arrived ||
      !goal ||
      paused ||
      !actual ||
      !actual.grounded ||
      actual.collision !== "active"
    )
      return;
    if (work.busy) return;
    if (route && native) install(maintain(), "local");
    else if (candidates?.length && identity(actual) !== lastEvidence)
      install(globalQuery(), "global");
  }
};
