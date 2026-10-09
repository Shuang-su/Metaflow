import { loadAssetConfig, machineLimits } from "../../scripts/mf97/asset-config.mjs";
import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import { mkdirSync, writeFileSync, statfsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const output =
  (process.env.MF97_CACHE_ROOT ??
    loadAssetConfig().roots.continuation) +
  "/validation/soak/";
mkdirSync(output, { recursive: true });
const report = {
  environment:
    "Chrome headless native keyboard; stability run, not isolated performance or phone validation",
  durationTargetMs: 30 * 60 * 1000,
  errors: [],
  samples: [],
  goals: [],
  passed: false,
};
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--ignore-gpu-blocklist"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("guidanceMode", "true");
    localStorage.setItem("guidanceMapVisible", "true");
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(message.text());
  });
  await page.goto("http://127.0.0.1:5185/?scene=apms-2026", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.mf97?.viewer.state.loaded, null, {
    timeout: 300000,
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const started = Date.now();
  report.startedAt = new Date(started).toISOString();
  let index = 0;
  while (Date.now() - started < report.durationTargetMs) {
    const disk = statfsSync(output);
    if (disk.bavail * disk.bsize < machineLimits().reserveGiB * 1024 ** 3 + 16 * 1024 ** 2)
      throw Error(
        "Configured disk reserve violated: preserve this browser resource test",
      );
    const goal = [35, 42, 31, 38, 41, 27, 13, 4][index % 8];
    if (await page.evaluate(() => window.mf97.viewer.state.gamingControls))
      await page.keyboard.press("Escape");
    await page.mouse.move(640, 35);
    await page.locator(".sse-annotationInfo").click();
    await page
      .locator(`.sse-annotationMenuItem[data-annotation-index="${goal - 1}"]`)
      .click();
    await page.waitForFunction(
      (expected) => window.mf97.viewer.state.guidanceTarget === expected,
      goal - 1,
    );
    // Exercise native browser input. No setPosition or route autopilot.
    await page.mouse.click(800, 440);
    await page.keyboard.down(index % 2 ? "s" : "w");
    await page.waitForTimeout(500);
    await page.keyboard.up(index % 2 ? "s" : "w");
    if (await page.evaluate(() => window.mf97.viewer.state.gamingControls))
      await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    const status = await page.evaluate(() => ({
      goal: window.mf97.viewer.state.guidanceTarget,
      status: window.mf97.viewer.state.guidanceStatus,
      position: window.mf97.actual?.position,
      evidence: window.mf97.evidence.length,
      map: window.mf97.viewer.state.guidanceMapVisible,
    }));
    report.goals.push({ elapsedMs: Date.now() - started, ...status });
    if (status.goal !== goal - 1)
      throw Error("Old goal overwrote the active session");
    if (index % 4 === 0) {
      const metrics = (await cdp.send("Performance.getMetrics")).metrics;
      report.samples.push({
        elapsedMs: Date.now() - started,
        metrics: Object.fromEntries(
          metrics
            .filter((m) =>
              [
                "JSHeapUsedSize",
                "JSHeapTotalSize",
                "Nodes",
                "Documents",
                "JSEventListeners",
              ].includes(m.name),
            )
            .map((m) => [m.name, m.value]),
        ),
      });
      console.log(JSON.stringify(report.samples.at(-1)));
    }
    if (report.errors.length) throw Error("Browser error during resource tour");
    writeFileSync(`${output}soak.json`, JSON.stringify(report, null, 2));
    index++;
    await page.waitForTimeout(14000);
  }
  report.elapsedMs = Date.now() - started;
  report.passed = true;
  await page.screenshot({ path: `${output}soak-final.png` });
  await context.close();
} catch (error) {
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  if (report.startedAt)
    report.elapsedMs ??= Date.now() - Date.parse(report.startedAt);
  await browser.close();
  writeFileSync(`${output}soak.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      ...report,
      samples: report.samples.length,
      goals: report.goals.length,
    }),
  );
}
