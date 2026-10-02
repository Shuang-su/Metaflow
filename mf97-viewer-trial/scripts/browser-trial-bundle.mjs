/** Real browser selection of the independently validated collision/navigation pair. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import { createOfflineResources } from "../src/offline-resources.ts";

const resources = createOfflineResources();
resources.assertCapacity(5 * 1024 ** 2, "paired trial browser evidence");
const id = process.env.MF97_TRIAL_ID;
assert.match(id ?? "", /^[a-f0-9]{24}$/);
const bundle = JSON.parse(readFileSync(resolve(resources.root, "trial-bundles", id, "bundle.json"), "utf8"));
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--ignore-gpu-blocklist"] });
const report = { id, passed: false, errors: [], requests: [], states: [] };
const dir = resources.resolveOutput("validation/trial-browser");
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
await context.addInitScript(() => {
  localStorage.setItem("guidanceMode", "true");
  localStorage.setItem("guidanceMapVisible", "true");
});
const page = await context.newPage();
page.on("pageerror", error => { report.errors.push(error.message); console.error("PAGE", error.message); });
page.on("response", response => {
  if (/mf97-trial-bundles|mf97-accepted|navigation\//.test(response.url())) report.requests.push({ url: response.url(), status: response.status() });
});
const snapshot = () => page.evaluate(() => ({
  trial: window.mf97.trialBundle?.id ?? null,
  goal: window.mf97.viewer.state.guidanceTarget,
  mode: window.mf97.viewer.state.cameraMode,
  actual: window.mf97.actual,
  status: window.mf97.viewer.state.guidanceStatus,
  routes: window.mf97.evidence.filter(e => e.type === "route").map(e => ({ asset: e.route?.asset, points: e.route?.points?.length }))
}));
try {
  await page.goto(`http://127.0.0.1:5185/?scene=apms-2026&trial=${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.mf97?.viewer.state.loaded, null, { timeout: 300000 });
  console.log("Loaded paired trial");
  await page.waitForSelector(".sse-guidanceMap canvas", { state: "visible" });
  assert.equal((await snapshot()).trial, id);
  if (await page.evaluate(() => window.mf97.viewer.state.controlsHidden)) await page.keyboard.press("h");
  await page.mouse.move(710, 40);
  await page.locator(".sse-annotationInfo").click();
  assert.equal(await page.locator(".sse-annotationMenuItem:visible").count(), 42);
  await page.locator('.sse-annotationMenuItem[data-annotation-index="34"]').click();
  await page.waitForFunction(() => window.mf97.actual?.collision === "active", null, { timeout: 30000 });
  await page.waitForFunction(() => window.mf97.evidence.some(e => e.type === "route"), null, { timeout: 300000 });
  report.states.push(await snapshot());
  const start = report.states[0].actual.position;
  await page.mouse.click(960, 420);
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await page.waitForTimeout(500);
  report.states.push(await snapshot());
  assert.ok(Math.hypot(start.x - report.states[1].actual.position.x, start.z - report.states[1].actual.position.z) > .1);
  assert.equal(report.states[1].actual.collision, "active");
  assert.equal(report.states[1].goal, 34);
  if (await page.evaluate(() => window.mf97.viewer.state.gamingControls)) await page.keyboard.press("Escape");
  resources.writeFileAtomic(resolve(dir, id + ".png"), await page.screenshot());
  for (const url of [bundle.collisionUrl, bundle.collisionUrl.replace(/\.json$/, ".bin"), bundle.navigationManifestUrl, bundle.navigationMapUrl])
    assert.ok(report.requests.some(r => new URL(r.url).pathname === url && r.status === 200), "Paired asset not actually loaded: " + url);
  const bytes = await (await page.request.get("http://127.0.0.1:5185" + bundle.collisionUrl.replace(/\.json$/, ".bin"))).body();
  assert.equal(createHash("sha256").update(bytes).digest("hex"), bundle.identity.collisionHash);
  await page.getByRole("link", { name: "切回原碰撞与导航", exact: true }).click();
  await page.waitForFunction(() => window.mf97?.viewer.state.loaded, null, { timeout: 300000 });
  const original = await snapshot();
  assert.equal(original.trial, null);
  assert.equal(original.goal, null);
  assert.equal(new URL(page.url()).searchParams.has("trial"), false);
  assert.equal(await page.getByRole("link", { name: "切回原碰撞与导航", exact: true }).count(), 0);
  report.states.push(original);
  assert.equal(report.errors.length, 0);
  assert.equal(report.requests.some(r => r.status >= 400), false);
  report.passed = true;
} catch (error) {
  report.failure = String(error);
  report.states.push(await snapshot().catch(() => null));
  resources.writeFileAtomic(resolve(dir, id + "-failed.png"), await page.screenshot().catch(() => Buffer.from([])));
  process.exitCode = 1;
} finally {
  await browser.close();
  resources.writeJsonAtomic(resolve(dir, id + "-" + Date.now() + ".json"), report);
  console.log(JSON.stringify(report));
}
