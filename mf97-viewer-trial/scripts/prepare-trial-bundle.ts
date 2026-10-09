import { resolveRecordedPath } from "../../scripts/mf97/asset-config.mjs";
/** Prepare three small local-only overlays after all paired collision proofs pass. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOfflineResources,
  offlineResourceOptions,
} from "../src/offline-resources";
import { validateMapManifest } from "../../metaflow-viewer/src/navigation/map-assets";
import { validateTrialBundle, type TrialBundle } from "../src/trial-bundle";
import {
  prepareGroundNavigation,
  validateRebuildRecords,
  type RebuildOptions,
} from "./rebuild-ground-navigation";
import { sha } from "./gaussian-map-offline";
import { compareNativeMotion } from "./real-patch-validate";
import { VoxelCollision } from "../../metaflow-viewer/src/collision/voxel-collision";

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const inside = (root: string, file: string) => {
  const p = relative(realpathSync(root), realpathSync(file));
  return (
    p !== "" && p !== ".." && !p.startsWith(".." + sep) && !p.startsWith(sep)
  );
};
const localFile = (p: string) => resolve(import.meta.dirname, p);
const gpuFiles = [
  "browser-gpu-collision.mjs",
  "../src/gpu-collision-proof.ts",
  "../../metaflow-viewer/src/voxel-debug-overlay.ts",
].map(localFile);
const bundleFiles = [
  fileURLToPath(import.meta.url),
  localFile("../src/trial-bundle.ts"),
];
export type TrialBundleOptions = RebuildOptions & {
  navigation: string;
  gpuProof: string;
  regression: string;
  mapManifest: string;
};
/** Proof content checks remain testable without generating or installing any asset. */
export function validateTrialReports(
  material: any,
  native: any,
  gpu: any,
  regression: any,
) {
  if (
    native.nativePassed !== true ||
    native.nativeCrossingPassed !== true ||
    native.nativeIncomplete !== false ||
    !native.native?.length ||
    native.native.some(
      (n: any) =>
        n.passed !== true ||
        n.crossingPassed !== true ||
        n.cases?.length !== 9 ||
        n.cases.some(
          (c: any) => c.passed !== true || c.deterministicRepeat !== true,
        ),
    )
  )
    throw Error("Native normal-walking crossing proof has not passed");
  for (const n of native.native) {
    const expected = [
      "stand-0",
      "stand-1",
      "stand-2",
      "stand-3",
      "stand-4",
      "cross-x--1",
      "cross-x-1",
      "cross-z--1",
      "cross-z-1",
    ];
    if (
      n.dt !== 1 / 60 ||
      n.ticksPerCase !== 360 ||
      n.settleTicks !== 120 ||
      n.movementTicks !== 120 ||
      !same(
        n.cases.map((c: any) => c.scenario?.id),
        expected,
      )
    )
      throw Error("Native scenarios/timing are incomplete");
    const crossings = n.cases.filter((c: any) => c.scenario.crossing);
    if (
      crossings.length !== 4 ||
      crossings.some(
        (c: any) =>
          !["x", "z"].includes(c.scenario.crossing.axis) ||
          ![-1, 1].includes(c.scenario.crossing.direction) ||
          c.scenario.id !==
            `cross-${c.scenario.crossing.axis}-${c.scenario.crossing.direction}`,
      )
    )
      throw Error("Native bidirectional axis/scenario association differs");
    for (const c of crossings)
      for (const result of [c.beforeCrossing, c.afterCrossing])
        if (
          result?.passed !== true ||
          result.crossedEditProjection !== true ||
          result.sameLayerTicks !== 240 ||
          result.requiredSameLayerTicks !== 240 ||
          !Number.isFinite(result.closestHorizontalDistance) ||
          result.closestHorizontalDistance < 0
        )
          throw Error(
            "Native normal-walking crossing measurements did not pass",
          );
  }
  if (
    gpu.passed !== true ||
    !same(gpu.materialization, material) ||
    gpu.reviewHash !== native.reviewHash ||
    gpu.errors?.length !== 0 ||
    gpu.invalidShaderFingerprintRejected !== true ||
    gpu.gpu?.passed !== true ||
    gpu.gpu.backend !== "actual-webgpu" ||
    gpu.gpu.gpuErrors?.length !== 0 ||
    gpu.gpu.sources?.length !== 2
  )
    throw Error("Actual GPU proof is incomplete or from another artifact");
  for (const [index, sourceHash] of [
    material.sourceHash,
    material.outputHash,
  ].entries()) {
    const s = gpu.gpu.sources[index];
    if (
      s.sourceHash !== sourceHash ||
      s.gpuBinaryHash !== sourceHash.split(":")[1] ||
      s.uploadedDataExactlyMatchesCpu !== true ||
      s.mismatches !== 0 ||
      s.queryCount !== 125 ||
      s.gpuOccupancy?.length !== s.queryCount ||
      !same(s.cpuOccupancy, s.gpuOccupancy)
    )
      throw Error("GPU upload/query evidence differs from accepted collision");
  }
  const edits = native.difference?.changed?.map((e: any) => ({
    voxel: [e.ix, e.iy, e.iz],
    before: Number(e.before),
    after: Number(e.after),
  }));
  const queries = gpu.gpu.queries;
  if (
    !Array.isArray(queries) ||
    queries.length !== 125 ||
    new Set(queries.map((q: any) => JSON.stringify(q))).size !== 125 ||
    queries.some(
      (q: any) =>
        !Array.isArray(q) ||
        q.length !== 3 ||
        q.some((v: any) => !Number.isInteger(v)),
    )
  )
    throw Error("GPU query coordinates are invalid");
  if (edits?.length !== 1)
    throw Error("This GPU proof must cover the single accepted sparse edit");
  const expectedQueries = [];
  for (let z = -2; z <= 2; z++)
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++)
        expectedQueries.push([
          edits[0].voxel[0] + x,
          edits[0].voxel[1] + y,
          edits[0].voxel[2] + z,
        ]);
  if (
    !same(queries, expectedQueries) ||
    gpu.gpu.sources.some((s: any) =>
      s.gpuOccupancy.some((v: any) => v !== 0 && v !== 1),
    )
  )
    throw Error("GPU proof does not cover the accepted edit neighbourhood");
  const [before, after] = gpu.gpu.sources.map((s: any) => s.gpuOccupancy);
  const changed = queries.flatMap((voxel: number[], i: number) =>
    before[i] === after[i]
      ? []
      : [{ voxel, before: before[i], after: after[i] }],
  );
  if (!same(changed, edits) || !same(gpu.changedLocalQueries, changed))
    throw Error(
      "GPU changed bits differ from complete native source comparison",
    );
  if (
    regression.correctedSource !== true ||
    !same(regression.apms, { total: 42, passed: 42 }) ||
    !same(regression.sdi, { total: 25, passed: 25 }) ||
    !same(regression.fixed20, { total: 20, passed: 20 }) ||
    !same(regression.legacy7, { total: 7, passed: 7 })
  )
    throw Error(
      "Complete corrected/original control regression has not passed",
    );
}
export function prepareTrialBundle(options: TrialBundleOptions) {
  // Existing rebuild preflight verifies accepted edits, source, current analysis,
  // native validator/controller implementation, lattice and original navigation.
  const source = prepareGroundNavigation({
    ...options,
    output: options.navigation,
  });
  const frozen = new Map<string, string>(),
    aliases = new Map<string, string>();
  const read = (path: string) => {
    const canonical = realpathSync(path),
      bytes = readFileSync(canonical),
      hash = sha(bytes);
    if (
      (frozen.has(canonical) && frozen.get(canonical) !== hash) ||
      (aliases.has(resolve(path)) && aliases.get(resolve(path)) !== canonical)
    )
      throw Error("Bundle input changed during validation");
    frozen.set(canonical, hash);
    aliases.set(resolve(path), canonical);
    return bytes;
  };
  const parse = (path: string) => JSON.parse(read(path).toString());
  const artifact = realpathSync(options.artifact),
    navDirectory = realpathSync(options.navigation),
    artifactId = basename(artifact);
  if (
    !/^[a-f0-9]{24}$/.test(artifactId) ||
    !inside(resolve(options.resources.root, "accepted"), artifact) ||
    !inside(resolve(options.resources.root, "navigation"), navDirectory)
  )
    throw Error(
      "Trial assets must be independent accepted/navigation children of the continuation root",
    );
  const navigation = parse(resolve(navDirectory, "manifest.json")),
    gpu = parse(options.gpuProof),
    regression = parse(options.regression);
  validateRebuildRecords(navigation, source);
  if (
    navigation.status !== "complete" ||
    navigation.scene !== "apms-2026" ||
    navigation.appliedToViewer !== false ||
    navigation.key.generator !== "mf97-accepted-voxel-tiles-v2"
  )
    throw Error(
      "Only a complete independent APMS navigation rebuild can form this local trial",
    );
  const artifactBytes = read(resolve(artifact, "materialization.json"));
  if (
    navigation.provenance?.decisionHash !== source.material.decisionHash ||
    navigation.key.materializationHash !== sha(artifactBytes) ||
    navigation.key.nativeValidationHash !== sha(read(options.nativeValidation))
  )
    throw Error("Navigation is not bound to accepted native validation");
  for (const [file, hash] of [
    ["nav.bin", navigation.navHash],
    ["collision.bin", navigation.collisionHash],
    ["nav-positions.bin", navigation.display?.positionsHash],
    ["nav-indices.bin", navigation.display?.indicesHash],
  ])
    if (
      typeof hash !== "string" ||
      sha(read(resolve(navDirectory, file))) !== hash
    )
      throw Error("Navigation/display/collision binary is missing or changed");
  if (navigation.collisionHash !== source.material.outputHash.split(":")[1])
    throw Error("Navigation collision differs from the accepted binary");
  for (const tile of navigation.tiles)
    if (
      tile.hash &&
      sha(read(resolve(navDirectory, tile.name + ".bin"))) !== tile.hash
    )
      throw Error("Rebuilt tile changed");
  validateTrialReports(source.material, source.validation, gpu, regression);
  // Reuse the validated original nine-case native implementation, including its
  // crossing predicate. No duplicated physics/crossing formula and no reliance
  // on editable passed flags. This small CPU replay writes no replacement proof.
  const decode = (meta: any, bytes: Uint8Array) => {
    const copy = new Uint8Array(bytes),
      words = new Uint32Array(copy.buffer),
      n = meta.nodeWordCount ?? meta.nodeCount;
    return new VoxelCollision(meta, words.subarray(0, n), words.subarray(n));
  };
  const originalCollision = decode(
      source.old.meta,
      read(resolveRecordedPath(source.material.sourceFile).replace(/\.json$/, ".bin")),
    ),
    acceptedCollision = decode(
      source.meta,
      read(resolve(artifact, "walk.voxel.bin")),
    ),
    r = source.meta.voxelResolution,
    min = source.meta.gridBounds.min;
  const recomputed = source.validation.difference.changed.map((e: any) =>
    compareNativeMotion(
      originalCollision,
      acceptedCollision,
      {
        x: min[0] + (e.ix + 0.5) * r,
        y: min[1] + (e.iy + 0.5) * r,
        z: min[2] + (e.iz + 0.5) * r,
      },
      r,
    ),
  );
  if (!same(source.validation.native, recomputed))
    throw Error(
      "Native saved measurements differ from current exact physics replay",
    );
  const gpuImplementation = gpuFiles.map((file) => ({
    file,
    sha256: sha(read(file)),
  }));
  if (
    realpathSync(gpu.artifact) !== artifact ||
    !same(gpu.implementation, gpuImplementation) ||
    gpu.gpu.productionShaderSourceHash !== gpuImplementation[2].sha256
  )
    throw Error("GPU implementation or source artifact changed");

  const replayRoot = dirname(realpathSync(options.regression));
  const implementation = regression.implementation,
    project = localFile("../..");
  const requiredScripts = [
    "regression.ts",
    "../../mf79-viewer-trial/scripts/region-regression.ts",
    "../../mf79-viewer-trial/scripts/replay.ts",
    "../../mf79-viewer-trial/scripts/legacy-routes.ts",
    "../../mf79-viewer-trial/scripts/source.ts",
    "../../mf79-viewer-trial/src/planner.ts",
    "../../mf79-viewer-trial/src/native-motion.ts",
    "../../metaflow-viewer/src/cameras/walk-controller.ts",
  ].map(localFile);
  if (
    !Array.isArray(implementation) ||
    new Set(implementation.map((i: any) => i.file)).size !==
      implementation.length ||
    requiredScripts.some(
      (file) =>
        !implementation.some((i: any) => resolve(project, i.file) === file),
    )
  )
    throw Error("Regression implementation provenance is incomplete");
  for (const item of implementation)
    if (
      !inside(project, resolve(project, item.file)) ||
      sha(read(resolve(project, item.file))) !== item.sha256
    )
      throw Error("Regression implementation changed; rerun it");
  if (
    !same(regression.replayAssets?.["apms-2026"], {
      collision: resolve(artifact, "walk.voxel.json"),
      navigation: navDirectory,
    }) ||
    regression.replayAssets?.["sdi-2026"]
  )
    throw Error(
      "Regression must use exactly this APMS pair and original SDI control",
    );
  const evidence = regression.evidenceFiles;
  if (!Array.isArray(evidence) || evidence.length !== 5)
    throw Error("Full regression report hashes are missing");
  const reports = new Map<string, any>();
  for (const name of [
    "region-audit-apms-2026.json",
    "region-replay-apms-2026.json",
    "region-audit-sdi-2026.json",
    "region-replay-sdi-2026.json",
    "legacy-seven.json",
  ]) {
    const file = resolve(replayRoot, "docs", name),
      entry = evidence.find((e: any) => resolve(e.file) === file);
    if (!entry || sha(read(file)) !== entry.sha256)
      throw Error("Regression report missing or changed: " + name);
    reports.set(name, parse(file));
  }
  const manifests = regression.manifestHashes;
  if (
    !Array.isArray(manifests) ||
    manifests.length !== 6 ||
    new Set(manifests.map((m: any) => m.file)).size !== 6
  )
    throw Error(
      "Regression scene/marker/override/navigation inputs are not bound",
    );
  for (const m of manifests)
    if (sha(read(m.file)) !== m.sha256)
      throw Error("Regression manifest changed");
  for (const name of [
    "scene-exhibitions.json",
    "apms-markers-42.mfstudio.json",
    "sdi-25.settings.json",
  ]) {
    const file = resolve(project, "mf79-viewer-trial", name),
      entry = manifests.find((m: any) => m.file === file);
    if (!entry || sha(read(resolve(replayRoot, name))) !== entry.sha256)
      throw Error("Regression scene/marker input copy differs");
  }
  const navigationManifests = manifests
    .filter((m: any) => basename(m.file) === "manifest.json")
    .map((m: any) => ({ ...m, data: parse(m.file) }));
  if (navigationManifests.length !== 2)
    throw Error(
      "Regression needs both corrected APMS and original SDI manifests",
    );
  for (const [scene, total] of [
    ["apms-2026", 42],
    ["sdi-2026", 25],
  ] as const) {
    const m = navigationManifests.find((m: any) => m.data.scene === scene);
    if (
      !m ||
      sha(read(m.file)) !== m.sha256 ||
      (scene === "apms-2026" &&
        realpathSync(m.file) !== resolve(navDirectory, "manifest.json"))
    )
      throw Error("Regression manifest changed");
    const manifest = parse(m.file),
      audit = reports.get("region-audit-" + scene + ".json"),
      replay = reports.get("region-replay-" + scene + ".json");
    if (
      manifest.scene !== scene ||
      manifest.status !== "complete" ||
      audit.sourceHash !== manifest.sourceHash ||
      audit.asset !== manifest.fingerprint ||
      replay.asset !== manifest.fingerprint ||
      audit.radius !== 2
    )
      throw Error("Regression source/candidate/navigation mismatch");
    for (const [record, status] of [
      [audit, "native-replay-passed"],
      [replay, "replayed"],
    ] as const)
      if (
        record.rows?.length !== total ||
        new Set(record.rows.map((r: any) => r.index)).size !== total ||
        record.rows.some(
          (r: any) =>
            !Number.isInteger(r.index) ||
            r.index < 1 ||
            r.index > total ||
            r.status !== status,
        )
      )
        throw Error("Regression denominator or success rows changed");
    for (const row of replay.rows)
      if (
        row.cadence?.length !== 4 ||
        !same(row.cadence.map((c: any) => c.name).sort(), [
          "120",
          "30",
          "60",
          "jitter",
        ]) ||
        row.cadence.some(
          (c: any) =>
            c.arrived !== true ||
            c.sameArrival !== true ||
            !Number.isFinite(c.error) ||
            c.error > 0.01 ||
            c.arrivalTicks?.length !== 1 ||
            c.ticks !== row.ticks ||
            !same(c.arrivalTicks, row.referenceArrivalTicks),
        )
      )
        throw Error("Regression timing/arrival did not pass");
  }
  const legacy = reports
    .get("legacy-seven.json")
    .rows?.filter((r: any) => r.cohort === "legacy-seven");
  if (
    legacy?.length !== 7 ||
    new Set(legacy.map((r: any) => r.scene + ":" + r.id)).size !== 7 ||
    legacy.some(
      (r: any) =>
        r.status !== "native-walking-passed" ||
        !r.proof?.ok ||
        r.asset !==
          navigationManifests.find((m: any) => m.data.scene === r.scene)?.data
            .fingerprint,
    )
  )
    throw Error("Legacy seven did not fully pass");

  const originalMapManifest = realpathSync(options.mapManifest),
    map = parse(originalMapManifest);
  validateMapManifest(map, { collisionHash: source.material.sourceHash });
  if (map.scene !== navigation.scene || map.coverage.status !== "complete")
    throw Error(
      "Original Gaussian map is incomplete or belongs to another scene",
    );
  for (const layer of map.layers)
    for (const tile of layer.tiles) {
      const name = basename(tile.url);
      if (
        tile.url !== `/mf97-maps/${navigation.scene}/${name}` ||
        !/^[a-zA-Z0-9_-]+\.webp$/.test(name) ||
        sha(read(resolve(dirname(originalMapManifest), name))) !== tile.sha256
      )
        throw Error("Original Gaussian tile missing or changed");
    }
  const proofHashes = {
    materialization: sha(artifactBytes),
    native: sha(read(options.nativeValidation)),
    gpu: sha(read(options.gpuProof)),
    regression: sha(read(options.regression)),
    navigation: sha(read(resolve(navDirectory, "manifest.json"))),
    map: sha(read(originalMapManifest)),
    review: sha(read(options.review)),
    decisions: sha(read(options.decisions)),
  };
  const identity: TrialBundle["identity"] = {
    version: 1,
    scene: "apms-2026",
    artifactId,
    originalSourceHash: source.material.sourceHash,
    sourceHash: source.material.outputHash,
    analysisHash: source.material.analysisHash,
    decisionHash: source.material.decisionHash,
    navFingerprint: navigation.fingerprint,
    navHash: navigation.navHash,
    collisionHash: navigation.collisionHash,
    proofHashes,
    implementation: bundleFiles.map((file) => ({
      file,
      sha256: sha(read(file)),
    })),
    inputs: { artifact, navDirectory, originalMapManifest },
  };
  const id = sha(JSON.stringify(identity)).slice(0, 24),
    base = `/mf97-trial-bundles/${id}/`,
    output = options.resources.resolveOutput("trial-bundles/" + id);
  const checkOutputPaths = () => {
    for (const target of [
      output,
      ...["bundle.json", "navigation-manifest.json", "map-manifest.json"].map(
        (name) => resolve(output, name),
      ),
    ]) {
      let ancestor = target;
      while (!existsSync(ancestor)) ancestor = dirname(ancestor);
      if (
        resolve(realpathSync(ancestor), relative(ancestor, target)) !== target
      )
        throw Error(
          "Bundle output alias must not point at an existing source or artifact",
        );
    }
  };
  checkOutputPaths();
  const navigationOverlay = {
    ...navigation,
    trialBundle: {
      id,
      localOnly: true,
      originalManifestHash: proofHashes.navigation,
    },
  };
  const mapOverlay = {
    ...map,
    fingerprint: sha(
      JSON.stringify({
        originalManifestHash: proofHashes.map,
        collisionHash: identity.sourceHash,
      }),
    ),
    source: { ...map.source, collisionHash: identity.sourceHash },
    derivation: {
      bundleId: id,
      originalManifestHash: proofHashes.map,
      originalCollisionHash: identity.originalSourceHash,
      gaussianUnchanged: true,
      tilesReusedWithoutModification: true,
      reason:
        "Accepted sparse collision correction; Gaussian scene and map imagery unchanged",
    },
  };
  const encode = (value: unknown) => JSON.stringify(value, null, 2) + "\n",
    navigationBytes = encode(navigationOverlay),
    mapBytes = encode(mapOverlay);
  const bundle: TrialBundle = {
    version: 1,
    id,
    status: "validated-local-trial",
    defaultEnabled: false,
    identity,
    collisionUrl: `/mf97-accepted/${artifactId}/walk.voxel.json`,
    navigationManifestUrl: base + "navigation-manifest.json",
    navigationMapUrl: base + "map-manifest.json",
    originalUrl: "/?scene=apms-2026",
    files: { navigation: sha(navigationBytes), map: sha(mapBytes) },
    limitation:
      "Local APMS sparse-collision trial; original SDI control re-run. Not a multilayer validation or a published/default replacement.",
  };
  validateTrialBundle(bundle, id, navigation.scene);
  const assertUnchanged = () => {
    checkOutputPaths();
    source.assertInputsUnchanged();
    for (const [alias, canonical] of aliases)
      if (realpathSync(alias) !== canonical)
        throw Error("Bundle input alias changed");
    for (const [file, hash] of frozen)
      if (sha(readFileSync(file)) !== hash)
        throw Error("Bundle input changed before publication");
  };
  assertUnchanged();
  return {
    bundle,
    output,
    navigationBytes,
    mapBytes,
    bundleBytes: encode(bundle),
    assertUnchanged,
  };
}
export function writeTrialBundle(options: TrialBundleOptions) {
  const prepared = prepareTrialBundle(options),
    { resources } = options;
  resources.assertCapacity(
    Buffer.byteLength(prepared.navigationBytes) +
      Buffer.byteLength(prepared.mapBytes) +
      Buffer.byteLength(prepared.bundleBytes),
    "local trial manifest overlays",
  );
  // The selectable commit marker is last. Interrupted overlays never enable a bundle.
  for (const [name, bytes] of [
    ["navigation-manifest.json", prepared.navigationBytes],
    ["map-manifest.json", prepared.mapBytes],
  ])
    resources.writeFileAtomic(resolve(prepared.output, name), bytes, {
      replace: false,
    });
  prepared.assertUnchanged();
  resources.writeFileAtomic(
    resolve(prepared.output, "bundle.json"),
    prepared.bundleBytes,
    { replace: false },
  );
  return {
    id: prepared.bundle.id,
    output: prepared.output,
    url: `/?scene=apms-2026&trial=${prepared.bundle.id}`,
    originalUrl: prepared.bundle.originalUrl,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2),
    arg = (key: string) => {
      const i = args.indexOf(key);
      if (i < 0 || !args[i + 1] || args[i + 1].startsWith("--"))
        throw Error("Required " + key);
      return args[i + 1];
    };
  const options: TrialBundleOptions = {
    artifact: arg("--artifact"),
    navigation: arg("--navigation"),
    nativeValidation: arg("--native-validation"),
    gpuProof: arg("--gpu-proof"),
    regression: arg("--regression"),
    review: arg("--review"),
    decisions: arg("--decisions"),
    original: arg("--original"),
    mapManifest: arg("--map-manifest"),
    resources: createOfflineResources({
      ...offlineResourceOptions(args),
      taskOutputBytes: 1024 ** 2,
    }),
  };
  if (args.includes("--check")) {
    const result = prepareTrialBundle(options);
    console.log(
      JSON.stringify({
        id: result.bundle.id,
        output: result.output,
        writes: 0,
      }),
    );
  } else console.log(JSON.stringify(writeTrialBundle(options)));
}
