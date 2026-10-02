import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import { createOfflineResources } from "../src/offline-resources.ts";

const resources = createOfflineResources(),
  origin = process.env.MF97_ORIGIN ?? "http://127.0.0.1:5185";
resources.assertCapacity(256 * 1024, "GPU collision proof evidence");
const artifactId = process.env.MF97_ACCEPTED_ID ?? "3e549296eae92fe8128bf676";
if (!/^[a-f0-9]{24}$/.test(artifactId))
  throw Error("Invalid independent materialization ID");
const artifact = resolve(resources.root, "accepted", artifactId);
const decisionFile = process.env.MF97_DECISIONS_FILE ?? resolve(resources.root, "review-decisions/apms-single-bump-c198-9.json");
const reviewFile = process.env.MF97_REVIEW_FILE ?? resolve(resources.root, "ground-v2/apms-2026/chunk-00198.review.json");
const materialization = JSON.parse(
  readFileSync(resolve(artifact, "materialization.json"), "utf8"),
);
const decisionBytes = readFileSync(
  decisionFile,
);
assert.equal(
  createHash("sha256").update(decisionBytes).digest("hex"),
  materialization.decisionHash,
);
assert.equal(materialization.complete, true);
assert.equal(materialization.coordinateSpace, "world");
const decisions = JSON.parse(decisionBytes.toString()),
  review = JSON.parse(
    readFileSync(
      reviewFile,
      "utf8",
    ),
  );
assert.equal(decisions.version, 1);
assert.equal(decisions.sourceHash, materialization.sourceHash);
assert.equal(decisions.analysisHash, materialization.analysisHash);
assert.equal(review.sourceFile, materialization.sourceFile);
assert.equal(review.protectionVersion, 2);
assert.equal(decisions.acceptedCandidateIds.length, 1);
assert.ok(
  !decisions.rejectedCandidateIds.includes(decisions.acceptedCandidateIds[0]),
);
assert.equal(
  review.candidates.find(
    (candidate) => candidate.id === decisions.acceptedCandidateIds[0],
  )?.status,
  "proposed",
);
const edits = review.candidates
  .filter((candidate) => decisions.acceptedCandidateIds.includes(candidate.id))
  .flatMap((candidate) => candidate.edits);
assert.equal(edits.length, 1);
assert.equal(materialization.validation.changedVoxelCount, 1);
assert.equal(review.sourceHash, materialization.sourceHash);
assert.equal(review.analysisHash, materialization.analysisHash);
const edited = edits[0],
  queries = [];
for (let z = -2; z <= 2; z++)
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++)
      queries.push([edited.ix + x, edited.iy + y, edited.iz + z]);
const assetRoot = "/Volumes/Prism_初号機/3D高斯/";
assert.ok(materialization.sourceFile.startsWith(assetRoot));
const sources = [
  {
    label: "original",
    url: "/scene-assets/" + materialization.sourceFile.slice(assetRoot.length),
    hash: materialization.sourceHash,
  },
  {
    label: "accepted-independent-copy",
    url: `/mf97-accepted/${artifactId}/walk.voxel.json`,
    hash: materialization.outputHash,
  },
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const productionShaderFile = resolve(
  import.meta.dirname,
  "../../metaflow-viewer/src/voxel-debug-overlay.ts",
);
const expectedProductionShaderSourceHash = hash(
  readFileSync(productionShaderFile),
);
const report = {
  passed: false,
  generatedAt: new Date().toISOString(),
  artifact,
  materialization,
  edited,
  reviewHash: hash(
    readFileSync(
      reviewFile,
    ),
  ),
  implementation: [
    import.meta.filename,
    resolve(import.meta.dirname, "../src/gpu-collision-proof.ts"),
    productionShaderFile,
  ].map((file) => ({ file, sha256: hash(readFileSync(file)) })),
  errors: [],
};
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${origin}/gpu-collision-proof.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => typeof window.runGpuCollisionProof === "function",
  );
  console.log(
    "GPU: sequential original/copy upload readback and 125 local production occupancy queries each",
  );
  // A stale/mismatched browser module must reject before any GPU source load.
  const invalidSource = await page.evaluate(
    async (input) => {
      try {
        await window.runGpuCollisionProof(input);
        return null;
      } catch (error) {
        return error.message;
      }
    },
    { sources, queries, expectedProductionShaderSourceHash: "0".repeat(64) },
  );
  assert.match(invalidSource, /production shader source differs/);
  report.invalidShaderFingerprintRejected = true;
  report.gpu = await page.evaluate(
    async (input) =>
      Promise.race([
        window.runGpuCollisionProof(input),
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("GPU proof timeout")), 90000),
        ),
      ]),
    { sources, queries, expectedProductionShaderSourceHash },
  );
  assert.equal(
    report.gpu.productionShaderSourceHash,
    expectedProductionShaderSourceHash,
  );
  const [original, corrected] = report.gpu.sources;
  const changed = queries.flatMap((voxel, index) =>
    original.gpuOccupancy[index] !== corrected.gpuOccupancy[index]
      ? [
          {
            voxel,
            before: original.gpuOccupancy[index],
            after: corrected.gpuOccupancy[index],
          },
        ]
      : [],
  );
  assert.deepEqual(changed, [
    {
      voxel: [edited.ix, edited.iy, edited.iz],
      before: Number(edited.before),
      after: Number(edited.after),
    },
  ]);
  assert.deepEqual(report.errors, []);
  assert.ok(
    report.implementation.every(
      (item) => hash(readFileSync(item.file)) === item.sha256,
    ),
    "Proof implementation changed during validation",
  );
  report.changedLocalQueries = changed;
  report.passed = true;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
  const output = `validation/gpu-collision-${artifactId}-v2.json`;
  resources.writeJsonAtomic(output, report, { replace: false });
  console.log(
    JSON.stringify({
      passed: report.passed,
      backend: report.gpu?.backend,
      sources: report.gpu?.sources.map(
        ({
          label,
          binaryBytes,
          queryCount,
          mismatches,
          uploadedDataExactlyMatchesCpu,
        }) => ({
          label,
          binaryBytes,
          queryCount,
          mismatches,
          uploadedDataExactlyMatchesCpu,
        }),
      ),
      changed: report.changedLocalQueries,
      errors: report.errors,
      output: resolve(resources.root, output),
    }),
  );
}
