import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import {
  SurfaceCatalogIndex,
  surfaceIdentity,
} from "../../metaflow-viewer/src/navigation/layers";
import type { SurfaceCatalog } from "../../metaflow-viewer/src/navigation/layers";

const require = createRequire(import.meta.url);
const { build } = require("esbuild") as typeof import("esbuild");
const sourceUrl = new URL(
  "../../metaflow-viewer/src/navigation/integration.ts",
  import.meta.url,
);

// Execute the actual integration and its pure dependencies. Replace only Drawing,
// which requires WebGL, so lifecycle checks need no browser or graphics device.
const program = (async () => {
  const source = await readFile(sourceUrl, "utf8");
  const drawingImport = "import { NavigationDrawing } from './drawing';";
  assert.ok(source.includes(drawingImport));
  const result = await build({
    stdin: {
      contents: source.replace(
        drawingImport,
        "const NavigationDrawing = globalThis.__drawing;",
      ),
      resolveDir: new URL("./", sourceUrl).pathname,
      sourcefile: sourceUrl.pathname,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
})();

class Events {
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  on(name: string, callback: (...args: unknown[]) => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(callback);
    return { off: () => this.handlers.get(name)!.delete(callback) };
  }
  fire(name: string, ...args: unknown[]) {
    this.handlers.get(name)?.forEach((callback) => callback(...args));
  }
}

const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

async function fixture(
  config: { navigationMapUrl?: string; navigationManifestUrl?: string },
  fetch: typeof globalThis.fetch,
  annotations: unknown[] = [],
) {
  const mapCalls: { url: string; expected: Record<string, unknown> }[] = [];
  let workers = 0;
  const instances: {
    onmessage?: (event: { data: unknown }) => void;
    messages: any[];
  }[] = [];
  class Drawing {
    mapAssets(url: string, expected: Record<string, unknown> = {}) {
      mapCalls.push({ url, expected });
    }
    preferences() {}
    visible() {}
    status() {}
    route() {}
    regions() {}
    choices() {}
    surfaceContext() {}
    assets() {}
    pose() {}
    destroy() {}
  }
  const module = {
    exports: {} as { installNavigation: (global: unknown) => () => void },
  };
  runInNewContext(await program, {
    module,
    exports: module.exports,
    require,
    __drawing: Drawing,
    URL,
    fetch,
    location: { href: "http://127.0.0.1:5185/" },
    document: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
    },
    window: { setInterval: () => 0 },
    clearInterval() {},
    setTimeout,
    clearTimeout,
    performance,
    structuredClone,
    Worker: class {
      onmessage?: (event: { data: unknown }) => void;
      messages: any[] = [];
      constructor() {
        workers++;
        instances.push(this);
      }
      postMessage(value: unknown) {
        this.messages.push(value);
      }
      terminate() {}
    },
  });
  const events = new Events();
  const state = {
    guidanceMode: false,
    guidanceMapVisible: true,
    cameraMode: "orbit",
    xrMode: false,
    loaded: true,
    walkAllowed: true,
    guidanceTarget: null,
    selectedAnnotation: null,
    guidanceStatus: "",
  };
  const dispose = module.exports.installNavigation({
    config: { ...config, navigationWorkerUrl: "/worker.js" },
    state,
    events,
    app: {},
    settings: { annotations },
  });
  await settle();
  return {
    mapCalls,
    workers: () => workers,
    instances,
    dispose,
    state,
    events,
  };
}

test("explicit Gaussian map loads while navigation metadata remains pending and guidance is off", async () => {
  const f = await fixture(
    { navigationMapUrl: "/maps.json", navigationManifestUrl: "/slow-nav.json" },
    (() => new Promise<Response>(() => {})) as typeof fetch,
  );
  try {
    assert.equal(f.mapCalls.length, 1);
    assert.equal(f.mapCalls[0].url, "/maps.json");
    assert.equal(f.workers(), 0);
  } finally {
    f.dispose();
  }
});

test("sidecar map waits for metadata then receives its collision source identity without booting navigation", async () => {
  let complete!: (response: Response) => void;
  const f = await fixture(
    { navigationManifestUrl: "/navigation/manifest.json" },
    (() =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      })) as typeof fetch,
  );
  try {
    assert.equal(f.mapCalls.length, 0);
    complete({
      ok: true,
      json: async () => ({
        status: "complete",
        sourceHash: "collision-v1",
        mapsUrl: "../maps/manifest.json",
      }),
    } as Response);
    await settle();
    assert.equal(f.mapCalls.length, 1);
    assert.equal(f.mapCalls[0].url, "http://127.0.0.1:5185/maps/manifest.json");
    assert.equal(f.mapCalls[0].expected.collisionHash, "collision-v1");
    assert.equal(f.workers(), 0);
  } finally {
    f.dispose();
  }
});

test("destroyed integration cannot reconnect maps after navigation metadata resolves", async () => {
  let complete!: (response: Response) => void;
  const f = await fixture(
    { navigationMapUrl: "/maps.json", navigationManifestUrl: "/slow-nav.json" },
    (() =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      })) as typeof fetch,
  );
  const before = f.mapCalls.length;
  f.dispose();
  complete({
    ok: true,
    json: async () => ({ status: "complete", sourceHash: "collision-v1" }),
  } as Response);
  await settle();
  assert.equal(f.mapCalls.length, before);
  assert.equal(f.workers(), 0);
});

test("map-only scene needs no navigation manifest request or Worker", async () => {
  let requests = 0;
  const f = await fixture({ navigationMapUrl: "/maps.json" }, (async () => {
    requests++;
    throw Error("navigation should not be requested");
  }) as typeof fetch);
  try {
    assert.equal(f.mapCalls.length, 1);
    assert.equal(requests, 0);
    assert.equal(f.workers(), 0);
  } finally {
    f.dispose();
  }
});

test("navigation boot does not downgrade then reconnect an already source-verified map", async () => {
  const f = await fixture(
    {
      navigationMapUrl: "/maps.json",
      navigationManifestUrl: "/navigation.json",
    },
    (async () =>
      ({
        ok: true,
        json: async () => ({ status: "complete", sourceHash: "collision-v1" }),
      }) as Response) as typeof fetch,
  );
  try {
    assert.equal(f.mapCalls.at(-1)?.expected.collisionHash, "collision-v1");
    const initialConnections = f.mapCalls.length;
    f.state.guidanceMode = true;
    f.events.fire("guidanceMode:changed", true);
    await settle();
    assert.equal(f.mapCalls.length, initialConnections);
    assert.equal(f.workers(), 1);
  } finally {
    f.dispose();
  }
});

test("navigation manifest binds Gaussian identity and exact scene transform as well as collision source", async () => {
  const transform = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 3, 0, 0, 1];
  const f = await fixture(
    { navigationManifestUrl: "/navigation.json" },
    (async () =>
      ({
        ok: true,
        json: async () => ({
          status: "complete",
          sourceHash: "collision-v1",
          mapsUrl: "/maps.json",
          mapSource: { gaussianHash: "gaussian-v1", transform },
        }),
      }) as Response) as typeof fetch,
  );
  try {
    assert.equal(f.mapCalls.length, 1);
    assert.equal(f.mapCalls[0].expected.collisionHash, "collision-v1");
    assert.equal(f.mapCalls[0].expected.gaussianHash, "gaussian-v1");
    assert.deepEqual(
      Array.from(f.mapCalls[0].expected.transform as number[]),
      transform,
    );
    assert.equal(f.workers(), 0);
  } finally {
    f.dispose();
  }
});

test("real integration preserves support through mode resumes and rejects stale region arrivals", async () => {
  const footprint = [
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 4, y: 0, z: 4 },
    { x: 0, y: 0, z: 4 },
  ];
  const { bounds, plane } = surfaceIdentity(
    "candidate",
    0,
    footprint,
    [0, 1, 0, 0],
  );
  const catalog: SurfaceCatalog = {
    version: 1,
    status: "confirmed",
    sceneId: "scene",
    collisionFingerprint: "collision",
    layers: [{ id: "reviewed-floor", label: "Floor" }],
    surfaces: [
      {
        id: "surface",
        kind: "floor",
        layerId: "reviewed-floor",
        bounds,
        plane,
        footprint,
      },
    ],
    contacts: [],
    destinations: [{ index: 0, surfaceId: "surface" }],
  };
  const index = new SurfaceCatalogIndex(catalog, "collision");
  const annotation = {
    camera: { initial: { position: [1, 1.5, 1], target: [1, 0, 0], fov: 75 } },
    extras: { metaflow: { nav: { enabled: true } } },
  };
  const f = await fixture(
    { navigationManifestUrl: "/navigation.json" },
    (async () =>
      ({
        ok: true,
        json: async () => ({
          status: "complete",
          fingerprint: "nav",
          sourceHash: "collision",
          surfaceCatalog: catalog,
          requireSurfaceCatalog: true,
        }),
      }) as Response) as typeof fetch,
    [annotation],
  );
  try {
    f.state.guidanceMode = true;
    f.state.cameraMode = "walk";
    f.events.fire("guidanceMode:changed", true);
    await settle();
    const worker = f.instances[0];
    assert.ok(worker);
    worker.onmessage!({ data: { type: "ready", session: 0 } });
    const pose = (tick: number) => ({
      tick,
      epoch: 1,
      position: { x: 1, y: 1.5, z: 1 },
      supportHeight: 0,
      grounded: true,
      jumping: false,
      collision: "active",
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      input: [0, 0, 0],
      body: { radius: 0.2, height: 1.5, eye: 1.3, hover: 0.2 },
    });
    f.events.fire("walk:physics", pose(1));
    f.events.fire("guidance:select", 0);
    const goal = worker.messages.find((m) => m.type === "goal");
    assert.equal(goal.support.surfaceId, "surface");
    assert.equal(goal.support.catalog, index.fingerprint);
    assert.equal(goal.goal.radius, 2);
    assert.equal(goal.goal.surfaceId, "surface");
    // A mode resume can send before another physics tick. It must carry the
    // existing tick's association rather than clear the Worker's support cache.
    for (const mode of ["cameraMode", "xrMode"] as const) {
      if (mode === "cameraMode") f.state.cameraMode = "orbit";
      else f.state.xrMode = true;
      f.events.fire(`${mode}:changed`);
      assert.equal(worker.messages.at(-1)?.type, "pause");
      assert.equal(worker.messages.at(-1)?.paused, true);
      if (mode === "cameraMode") f.state.cameraMode = "walk";
      else f.state.xrMode = false;
      f.events.fire(`${mode}:changed`);
      const resumed = worker.messages.at(-1);
      assert.equal(resumed.type, "pose");
      assert.equal(resumed.actual.tick, 1);
      assert.equal(resumed.support?.surfaceId, "surface");
      assert.equal(resumed.support?.catalog, index.fingerprint);
      assert.equal(resumed.support?.tick, resumed.actual.tick);
      assert.equal(resumed.support?.epoch, resumed.actual.epoch);
    }
    const region = {
      ref: 1,
      vertices: footprint,
      floor: 0,
      surfaceId: "surface",
      layerId: "reviewed-floor",
      catalog: "stale",
    };
    worker.onmessage!({
      data: { type: "region", session: goal.session, regions: [region] },
    });
    for (let i = 2; i <= 14; i++) f.events.fire("walk:physics", pose(i));
    assert.equal(f.state.selectedAnnotation, null);
    worker.onmessage!({
      data: {
        type: "region",
        session: goal.session,
        regions: [{ ...region, catalog: index.fingerprint }],
      },
    });
    for (let i = 15; i <= 26; i++) f.events.fire("walk:physics", pose(i));
    assert.equal(f.state.selectedAnnotation, 0);
    assert.equal(worker.messages.filter((m) => m.type === "arrived").length, 1);
    f.events.fire("walk:physics", pose(27));
    assert.equal(worker.messages.filter((m) => m.type === "arrived").length, 1);
  } finally {
    f.dispose();
  }
});

test("required missing or stale catalog cannot boot a navigation Worker", async () => {
  const f = await fixture(
    { navigationManifestUrl: "/navigation.json" },
    (async () =>
      ({
        ok: true,
        json: async () => ({
          status: "complete",
          fingerprint: "nav",
          sourceHash: "collision",
          requireSurfaceCatalog: true,
        }),
      }) as Response) as typeof fetch,
  );
  try {
    f.state.guidanceMode = true;
    f.events.fire("guidanceMode:changed", true);
    await settle();
    assert.equal(f.workers(), 0);
    assert.match(f.state.guidanceStatus, /目录尚未确认/);
  } finally {
    f.dispose();
  }
});
