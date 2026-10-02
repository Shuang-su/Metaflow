import test from "node:test";
import assert from "node:assert/strict";
import { sha } from "../scripts/gaussian-map-offline";
import { validateTrialReports } from "../scripts/prepare-trial-bundle";
import {
  loadTrialBundle,
  validateTrialBundle,
  type TrialBundle,
} from "../src/trial-bundle";

const h = "1".repeat(64),
  old = "2".repeat(64) + ":" + h,
  corrected = "3".repeat(64) + ":" + h;
function reports() {
  const material = { sourceHash: old, outputHash: corrected },
    edits = [{ ix: 1, iy: 2, iz: 3, before: true, after: false }];
  const native = {
    nativePassed: true,
    nativeCrossingPassed: true,
    nativeIncomplete: false,
    reviewHash: h,
    difference: { changed: edits },
    native: [
      {
        passed: true,
        crossingPassed: true,
        dt: 1 / 60,
        ticksPerCase: 360,
        settleTicks: 120,
        movementTicks: 120,
        cases: [
          "stand-0",
          "stand-1",
          "stand-2",
          "stand-3",
          "stand-4",
          "cross-x--1",
          "cross-x-1",
          "cross-z--1",
          "cross-z-1",
        ].map((id) => ({
          scenario: {
            id,
            crossing: id.startsWith("cross")
              ? { axis: id[6], direction: id.endsWith("--1") ? -1 : 1 }
              : undefined,
          },
          passed: true,
          deterministicRepeat: true,
          beforeCrossing: id.startsWith("cross")
            ? {
                passed: true,
                crossedEditProjection: true,
                sameLayerTicks: 240,
                requiredSameLayerTicks: 240,
                closestHorizontalDistance: 0.01,
              }
            : null,
          afterCrossing: id.startsWith("cross")
            ? {
                passed: true,
                crossedEditProjection: true,
                sameLayerTicks: 240,
                requiredSameLayerTicks: 240,
                closestHorizontalDistance: 0.01,
              }
            : null,
        })),
      },
    ],
  };
  const gpu = {
    passed: true,
    materialization: material,
    reviewHash: h,
    errors: [],
    invalidShaderFingerprintRejected: true,
    gpu: {
      passed: true,
      backend: "actual-webgpu",
      gpuErrors: [],
      queries: Array.from({ length: 125 }, (_, i) => [
        1 + (i % 5) - 2,
        2 + (Math.floor(i / 5) % 5) - 2,
        3 + Math.floor(i / 25) - 2,
      ]),
      sources: [old, corrected].map((sourceHash, index) => ({
        sourceHash,
        gpuBinaryHash: h,
        uploadedDataExactlyMatchesCpu: true,
        mismatches: 0,
        queryCount: 125,
        gpuOccupancy: Array.from({ length: 125 }, (_, i) =>
          index === 0 && i === 62 ? 1 : 0,
        ),
        cpuOccupancy: Array.from({ length: 125 }, (_, i) =>
          index === 0 && i === 62 ? 1 : 0,
        ),
      })),
    },
    changedLocalQueries: [{ voxel: [1, 2, 3], before: 1, after: 0 }],
  };
  const regression = {
    correctedSource: true,
    apms: { total: 42, passed: 42 },
    sdi: { total: 25, passed: 25 },
    fixed20: { total: 20, passed: 20 },
    legacy7: { total: 7, passed: 7 },
  };
  return { material, native, gpu, regression };
}
test("local trial refuses stationary-only native proof, changed GPU source and incomplete denominator", () => {
  const ok = reports();
  validateTrialReports(ok.material, ok.native, ok.gpu, ok.regression);
  for (const mutate of [
    (r: ReturnType<typeof reports>) => {
      r.native.nativeCrossingPassed = false;
    },
    (r: ReturnType<typeof reports>) => {
      r.native.native[0].crossingPassed = false;
    },
    (r: ReturnType<typeof reports>) => {
      r.native.native[0].cases.pop();
    },
    (r: ReturnType<typeof reports>) => {
      r.gpu.gpu.sources[1].sourceHash = old;
    },
    (r: ReturnType<typeof reports>) => {
      r.gpu.gpu.sources[1].uploadedDataExactlyMatchesCpu = false;
    },
    (r: ReturnType<typeof reports>) => {
      r.gpu.changedLocalQueries[0].voxel[0] = 42;
    },
    (r: ReturnType<typeof reports>) => {
      r.gpu.gpu.sources[0].gpuOccupancy.fill(0);
      r.gpu.gpu.sources[0].cpuOccupancy.fill(0);
    },
    (r: ReturnType<typeof reports>) => {
      r.gpu.gpu.queries[62] = [100, 100, 100];
    },
    (r: ReturnType<typeof reports>) => {
      r.native.native[0].cases[5].beforeCrossing!.crossedEditProjection = false;
    },
    (r: ReturnType<typeof reports>) => {
      r.native.native[0].cases[5].afterCrossing!.sameLayerTicks = 239;
    },
    (r: ReturnType<typeof reports>) => {
      r.native.native[0].cases[5].scenario.id = "stand-again";
    },
    (r: ReturnType<typeof reports>) => {
      r.native.native[0].cases[5].scenario.crossing = undefined;
    },
    (r: ReturnType<typeof reports>) => {
      r.regression.apms.passed = 41;
    },
    (r: ReturnType<typeof reports>) => {
      r.regression.apms.total = 41;
      r.regression.apms.passed = 41;
    },
  ]) {
    const r = reports();
    mutate(r);
    assert.throws(() =>
      validateTrialReports(r.material, r.native, r.gpu, r.regression),
    );
  }
});
function browserFixture() {
  const meta = {
      gridBounds: { min: [0, 0, 0], max: [1, 1, 1] },
      voxelResolution: 0.08,
    },
    corrected = sha(JSON.stringify(meta)) + ":" + h,
    key = { sourceHash: corrected },
    fingerprint = sha(JSON.stringify(key));
  const identity: TrialBundle["identity"] = {
    version: 1,
    scene: "apms-2026",
    artifactId: "a".repeat(24),
    originalSourceHash: old,
    sourceHash: corrected,
    analysisHash: h,
    decisionHash: h,
    navFingerprint: fingerprint,
    navHash: h,
    collisionHash: h,
    proofHashes: Object.fromEntries(
      [
        "materialization",
        "native",
        "gpu",
        "regression",
        "navigation",
        "map",
        "review",
        "decisions",
      ].map((k) => [k, h]),
    ),
    implementation: [{ file: "/fixture/implementation.ts", sha256: h }],
    inputs: {
      artifact: "/fixture/accepted",
      navDirectory: "/fixture/navigation",
      originalMapManifest: "/fixture/map",
    },
  };
  const id = sha(JSON.stringify(identity)).slice(0, 24),
    base = `/mf97-trial-bundles/${id}/`,
    bounds = { minX: 0, minZ: 0, maxX: 1, maxZ: 1 };
  const navigation = {
    status: "complete",
    scene: "apms-2026",
    sourceHash: corrected,
    fingerprint,
    navHash: h,
    collisionHash: h,
    key,
    meta,
    trialBundle: { id },
  };
  const map = {
    version: 1,
    scene: "apms-2026",
    source: {
      gaussianHash: h,
      collisionHash: corrected,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
    layers: [
      {
        id: "one",
        label: "one",
        supportRange: [0, 0],
        sliceRange: [0, 1],
        bounds,
        tiles: [
          {
            id: "a",
            url: "/mf97-maps/apms-2026/a.webp",
            sha256: h,
            width: 16,
            height: 16,
            bounds,
            status: "ready",
          },
        ],
      },
    ],
    coverage: { expected: 1, ready: 1, status: "complete" },
    derivation: {
      bundleId: id,
      originalManifestHash: h,
      gaussianUnchanged: true,
    },
  };
  const bundle: TrialBundle = {
    version: 1,
    id,
    status: "validated-local-trial",
    defaultEnabled: false,
    identity,
    collisionUrl: `/mf97-accepted/${identity.artifactId}/walk.voxel.json`,
    navigationManifestUrl: base + "navigation-manifest.json",
    navigationMapUrl: base + "map-manifest.json",
    originalUrl: "/?scene=apms-2026",
    files: {
      navigation: sha(JSON.stringify(navigation)),
      map: sha(JSON.stringify(map)),
    },
    limitation: "fixture only",
  };
  const files = new Map([
    [base + "bundle.json", JSON.stringify(bundle)],
    [bundle.navigationManifestUrl, JSON.stringify(navigation)],
    [bundle.navigationMapUrl, JSON.stringify(map)],
    [bundle.collisionUrl, JSON.stringify(meta)],
  ]);
  const fetcher: typeof fetch = async (input) =>
    new Response(files.get(String(input)) ?? "missing", {
      status: files.has(String(input)) ? 200 : 404,
    });
  return { bundle, navigation, map, files, fetcher };
}
test("browser consumes one complete pair and explicit original rollback without persisting defaults", async () => {
  const f = browserFixture(),
    result = await loadTrialBundle(f.bundle.id, "apms-2026", f.fetcher);
  assert.equal(result.collisionUrl, f.bundle.collisionUrl);
  assert.equal(result.originalUrl, "/?scene=apms-2026");
  assert.equal(result.bundle.defaultEnabled, false);
});
test("browser rejects wrong scene, traversal, remote URLs, modified overlay and absent files", async () => {
  const f = browserFixture();
  await assert.rejects(loadTrialBundle("../a", "apms-2026", f.fetcher));
  await assert.rejects(loadTrialBundle(f.bundle.id, "sdi-2026", f.fetcher));
  assert.throws(
    () =>
      validateTrialBundle(
        { ...f.bundle, collisionUrl: "https://example.com/x" },
        f.bundle.id,
        "apms-2026",
      ),
    /路径/,
  );
  f.files.set(
    f.bundle.navigationManifestUrl,
    JSON.stringify({ ...f.navigation, sourceHash: old }),
  );
  await assert.rejects(
    loadTrialBundle(f.bundle.id, "apms-2026", f.fetcher),
    /指纹/,
  );
  f.files.delete(f.bundle.navigationManifestUrl);
  await assert.rejects(
    loadTrialBundle(f.bundle.id, "apms-2026", f.fetcher),
    /缺失/,
  );
});
test("browser rejects correctly hashed manifests with mismatched collision/map identities", async () => {
  for (const target of ["nav", "map"]) {
    const f = browserFixture();
    if (target === "nav") {
      f.navigation.sourceHash = old;
      f.bundle.files.navigation = sha(JSON.stringify(f.navigation));
      f.files.set(f.bundle.navigationManifestUrl, JSON.stringify(f.navigation));
    } else {
      f.map.source.collisionHash = old;
      f.bundle.files.map = sha(JSON.stringify(f.map));
      f.files.set(f.bundle.navigationMapUrl, JSON.stringify(f.map));
    }
    f.files.set(
      `/mf97-trial-bundles/${f.bundle.id}/bundle.json`,
      JSON.stringify(f.bundle),
    );
    await assert.rejects(
      loadTrialBundle(f.bundle.id, "apms-2026", f.fetcher),
      /碰撞/,
    );
  }
});
