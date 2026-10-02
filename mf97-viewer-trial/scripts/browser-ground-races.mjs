import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import { createOfflineResources } from "../src/offline-resources.ts";

const resources = createOfflineResources();
const input =
  process.env.MF97_REVIEW_ROOT ?? resolve(resources.root, "ground-v2");
const origin = process.env.MF97_ORIGIN ?? "http://127.0.0.1:5185";
const output = "validation/ground-browser/races.json";
resources.assertCapacity(256 * 1024, "ground browser race evidence");
// A real entrance-floor candidate chosen from the source review, not a high
// fixture/tabletop which merely happens to contain fewer edits.
const file = resolve(
  input,
  "apms-2026",
  process.env.MF97_RACE_REPORT ?? "chunk-00182.review.json",
);
const review = JSON.parse(readFileSync(file, "utf8")),
  index = Number(process.env.MF97_RACE_CANDIDATE ?? "30");
const selected = { review, index, candidate: review.candidates[index] };
if (
  selected.candidate?.status !== "proposed" ||
  !selected.candidate.edits.length
)
  throw Error(
    "The selected real source candidate is not a proposal; no acceptance will be invented",
  );
const report = {
  passed: false,
  generatedAt: new Date().toISOString(),
  input,
  file,
  candidateId: selected.candidate.id,
  sourceHash: selected.review.sourceHash,
  analysisHash: selected.review.analysisHash,
  tests: [],
  errors: [],
  acceptedCount: 0,
};
if (existsSync(resolve(resources.root, output))) {
  const previous = JSON.parse(
    readFileSync(resolve(resources.root, output), "utf8"),
  );
  const { previousAttempts = [], ...attempt } = previous;
  report.previousAttempts = [...previousAttempts, attempt];
}
const gate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function within(promise, ms, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--ignore-gpu-blocklist"],
});
let releaseAuto = () => {},
  releaseManifest = () => {};
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  const autoSeen = gate(),
    autoRelease = gate(),
    autoDone = gate();
  let intercepted = false;
  releaseAuto = autoRelease.resolve;
  await page.route(
    "**/mf97-ground/sdi-2026/chunk-*.review.json",
    async (route) => {
      if (intercepted) return route.continue();
      intercepted = true;
      autoSeen.resolve(route.request().url());
      await autoRelease.promise;
      try {
        await route.continue();
      } catch {
        /* The new file selection aborts the obsolete request. */
      }
      autoDone.resolve();
    },
  );
  await page.goto(`${origin}/ground-review.html?scene=sdi-2026`, {
    waitUntil: "domcontentloaded",
  });
  const delayedAutoUrl = await within(
    autoSeen.promise,
    60000,
    "Automatic report load did not start",
  );
  console.log("RACE: automatic chunk held; selecting manual report");
  await page.locator("#files").setInputFiles(file);
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll("#candidate option").length === count &&
      document.querySelector("#verification").textContent.includes("SHA-256"),
    selected.review.candidates.length,
  );
  autoRelease.resolve();
  await within(
    autoDone.promise,
    10000,
    "Obsolete automatic request did not settle",
  );
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator("#candidate option").count(),
    selected.review.candidates.length,
  );
  assert.match(await page.locator("#summary").textContent(), /^1 个分块/);
  await page.locator("#candidate").selectOption(String(selected.index));
  assert.ok(
    (await page.locator("#detail").textContent()).includes(
      selected.candidate.surface.id,
    ),
  );
  assert.match(
    await page.locator("#policy").textContent(),
    /算法指纹与当前服务一致/,
  );
  assert.equal(await page.locator("#accept").isDisabled(), true);
  report.tests.push({
    name: "manual report supersedes in-flight automatic full-scene load",
    passed: true,
    delayedAutoUrl,
    manualCandidateCount: selected.review.candidates.length,
    summary: await page.locator("#summary").textContent(),
  });

  const contextResponse = await page.request.get(
    `${origin}/__mf97_review_context`,
  );
  assert.equal(contextResponse.ok(), true);
  const context = await contextResponse.json(),
    scene = context.scenes.find(
      (value) => value.sourceHash === selected.review.sourceHash,
    );
  assert.ok(
    scene?.gaussianProof?.verifiedFileCount > 0,
    "Live Gaussian source proof is required",
  );
  const manifestUrl = new URL(scene.job.assetUrl, origin).href;
  const manifestSeen = gate(),
    manifestRelease = gate();
  let manifestRequests = 0,
    holdManifest = true;
  releaseManifest = manifestRelease.resolve;
  await page.route(manifestUrl, async (route) => {
    manifestRequests++;
    if (holdManifest) {
      manifestSeen.resolve();
      await manifestRelease.promise;
    }
    await route.continue();
  });
  await page.locator("#section-render").click();
  await within(
    manifestSeen.promise,
    30000,
    "Section source manifest was not requested",
  );
  await page.locator("#section-cancel").click();
  assert.equal(
    await page.locator("#section-render").isDisabled(),
    true,
    "Cancelled create retains canvas ownership until settled",
  );
  await page.dispatchEvent("#section-render", "click");
  await page.waitForTimeout(200);
  assert.equal(
    manifestRequests,
    1,
    "Busy guard must reject a second create even if a click is dispatched",
  );
  assert.equal(
    await page.locator("#section-status").textContent(),
    "已取消剖面生成。",
  );
  holdManifest = false;
  manifestRelease.resolve();
  await page.waitForFunction(
    () => !document.querySelector("#section-render").disabled,
    null,
    { timeout: 60000 },
  );
  assert.equal(
    await page.locator("#section-status").textContent(),
    "已取消剖面生成。",
  );
  assert.equal(await page.locator("#accept").isDisabled(), true);
  report.tests.push({
    name: "cancelled initialization keeps exclusive canvas ownership until settled",
    passed: true,
    manifestRequestsWhileHeld: 1,
    manifestRequestsAfterSettlement: manifestRequests,
  });
  console.log(
    "RACE: cancelled initialization settled; rendering actual Gaussian section",
  );

  await page.locator("#section-render").click();
  await page.waitForFunction(
    () =>
      /^(已生成|剖面未完成|没有通过|范围内无)/.test(
        document.querySelector("#section-status").textContent,
      ),
    null,
    { timeout: 180000 },
  );
  const rendered = await page.locator("#section-status").textContent();
  assert.match(
    rendered,
    /^已生成/,
    "The actual Gaussian section must complete before evidence invalidation can be tested",
  );
  await page
    .locator("#decision-reason")
    .fill("Race fixture verifies enabling only; no candidate is accepted.");
  assert.equal(
    await page.locator("#accept").isEnabled(),
    true,
    "Current visual evidence and reason should enable review",
  );
  // Choosing the identical native file twice can suppress the browser's change
  // event. A new File with identical report bytes exercises actual reimport.
  const reimportName = `reimport-${basename(file)}`;
  await page.locator("#files").setInputFiles({
    name: reimportName,
    mimeType: "application/json",
    buffer: readFileSync(file),
  });
  await page.waitForFunction(
    ({ count, name }) =>
      document.querySelectorAll("#candidate option").length === count &&
      document.querySelector("#candidate option").textContent.includes(name) &&
      document.querySelector("#verification").textContent.includes("SHA-256"),
    { count: selected.review.candidates.length, name: reimportName },
  );
  await page.locator("#candidate").selectOption(String(selected.index));
  assert.ok(
    (await page.locator("#detail").textContent()).includes(
      selected.candidate.surface.id,
    ),
  );
  assert.match(await page.locator("#section-status").textContent(), /尚未生成/);
  assert.equal(
    await page.locator("#accept").isDisabled(),
    true,
    "Same source/ID in a new report needs new section evidence",
  );
  const blank = await page.locator("#gaussian-section").evaluate((canvas) => {
    const data = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4)
      if (data[index]) return false;
    return true;
  });
  assert.equal(
    blank,
    true,
    "The prior Gaussian pixels and overlay must be cleared",
  );
  assert.match(
    await page.locator("#summary").textContent(),
    /已接受 0，已拒绝 0/,
  );
  report.tests.push({
    name: "reimporting same source and candidate ID invalidates current visual evidence",
    passed: true,
    previousRenderedStatus: rendered,
    clearedCanvas: blank,
    acceptDisabled: true,
  });
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  releaseAuto();
  releaseManifest();
  await browser.close();
  resources.writeJsonAtomic(output, report);
  console.log(
    JSON.stringify({ ...report, output: resolve(resources.root, output) }),
  );
}
