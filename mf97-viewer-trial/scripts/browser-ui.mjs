import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const dir =
  (process.env.MF97_CACHE_ROOT ??
    "/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002") +
  "/validation/ui";
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--ignore-gpu-blocklist"],
});
const rows = [];
try {
  for (const [name, size] of [
    ["desktop", { width: 1440, height: 960 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport: size,
      hasTouch: name === "mobile",
      isMobile: name === "mobile",
    });
    await context.addInitScript(() => {
      localStorage.setItem("guidanceMode", "false");
      localStorage.setItem("guidanceMapVisible", "true");
      localStorage.setItem("guidanceRadius", "3");
    });
    const page = await context.newPage(),
      errors = [],
      consoleErrors = [];
    const row = { name, size, errors, consoleErrors };
    rows.push(row);
    try {
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.log("PAGEERROR", e.message);
      });
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      await page.goto("http://127.0.0.1:5185/?scene=apms-2026&mixed=1", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForFunction(() => window.mf97?.viewer.state.loaded, null, {
        timeout: 300000,
      });
      await page.waitForSelector(".sse-guidanceMap canvas", {
        state: "visible",
      });
      await page.waitForTimeout(1500);
      row.loaded = true;
      const initial = await page.evaluate(() => ({
        title: document.title,
        mode: window.mf97.viewer.state.cameraMode,
        guide: window.mf97.viewer.state.guidanceMode,
        map: window.mf97.viewer.state.guidanceMapVisible,
        position:
          window.mf97.actual?.position ?? window.getCameraPose?.().position,
      }));
      if (initial.guide !== false || initial.map !== true)
        throw Error("Fresh preferences mismatch");
      if (await page.evaluate(() => window.mf97.viewer.state.controlsHidden))
        await page.keyboard.press("h");
      await page.mouse.move(size.width * 0.48, 40);
      await page.mouse.move(size.width * 0.52, 42);
      await page.waitForTimeout(100);
      await page.locator(".sse-annotationInfo").click();
      const menuCount = await page
        .locator(".sse-annotationMenuItem:visible")
        .count();
      await page.keyboard.press("Escape");
      if (await page.evaluate(() => window.mf97.viewer.state.controlsHidden))
        await page.keyboard.press("h");
      await page.mouse.move(size.width - 140, size.height - 25);
      await page.mouse.move(size.width - 80, size.height - 25);
      await page.waitForTimeout(100);
      await page.locator(".sse-settings").click();
      await page.getByRole("switch", { name: "导览模式", exact: true }).click();
      await page.getByRole("switch", { name: "小地图", exact: true }).click();
      const independent = await page.evaluate(() => ({
        guide: window.mf97.viewer.state.guidanceMode,
        map: window.mf97.viewer.state.guidanceMapVisible,
        goal: window.mf97.viewer.state.guidanceTarget,
      }));
      await page.getByRole("switch", { name: "小地图", exact: true }).click();
      if (await page.evaluate(() => window.mf97.viewer.state.controlsHidden))
        await page.keyboard.press("h");
      await page.mouse.move(size.width - 140, size.height - 25);
      await page.mouse.move(size.width - 80, size.height - 25);
      await page.waitForTimeout(100);
      await page.locator(".sse-settings").click();
      if (await page.evaluate(() => window.mf97.viewer.state.controlsHidden))
        await page.keyboard.press("h");
      await page.mouse.move(size.width * 0.48, 40);
      await page.mouse.move(size.width * 0.52, 42);
      await page.waitForTimeout(100);
      await page.locator(".sse-annotationInfo").click();
      const navCount = await page
        .locator(".sse-annotationMenuItem:visible")
        .count();
      Object.assign(row, { initial, menuCount, independent, navCount });
      console.log("COUNTS", menuCount, navCount);
      if (menuCount !== 42 || navCount !== 41)
        throw Error("Guide/non-guide list filtering mismatch");
      await page
        .locator('.sse-annotationMenuItem[data-annotation-index="34"]')
        .click();
      await page.waitForFunction(
        () => window.mf97?.viewer.state.guidanceTarget === 34,
      );
      await page.waitForFunction(
        () => window.mf97.actual?.collision === "active",
        null,
        { timeout: 30000 },
      );
      await page.waitForFunction(
        () =>
          window.mf97.evidence.some((e) => e.type === "route") ||
          window.mf97.viewer.state.guidanceStatus.includes("已到达"),
        null,
        { timeout: 300000 },
      );
      const selected = await page.evaluate(() => ({
        mode: window.mf97.viewer.state.cameraMode,
        goal: window.mf97.viewer.state.guidanceTarget,
        status: window.mf97.viewer.state.guidanceStatus,
        position:
          window.mf97.actual?.position ?? window.getCameraPose?.().position,
        visibleHotspots: [
          ...document.querySelectorAll(".sse-annotation-hotspot"),
        ].filter((e) => !e.hidden && getComputedStyle(e).display !== "none")
          .length,
      }));
      await page.screenshot({ path: `${dir}/${name}-viewer.png` });
      // Keys while the menu owns focus must not drive native movement.
      if (await page.evaluate(() => window.mf97.viewer.state.controlsHidden))
        await page.keyboard.press("h");
      await page.mouse.move(size.width * 0.48, 40);
      await page.mouse.move(size.width * 0.52, 42);
      await page.waitForTimeout(100);
      await page.locator(".sse-annotationInfo").click();
      const start = await page.evaluate(() => window.mf97.actual?.position);
      await page.keyboard.down("w");
      await page.waitForTimeout(500);
      await page.keyboard.up("w");
      const end = await page.evaluate(() => window.mf97.actual?.position);
      await page.keyboard.press("Escape");
      Object.assign(row, {
        initial,
        menuCount,
        independent,
        navCount,
        selected,
        menuKeyStart: start,
        menuKeyEnd: end,
      });
      if (Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z) > 0.01)
        throw Error("Menu keys moved native viewer");
      const centre = { x: size.width * 0.65, y: size.height * 0.46 };
      await page.mouse.click(centre.x, centre.y);
      await page.keyboard.down("w");
      await page.waitForTimeout(800);
      await page.keyboard.up("w");
      await page.waitForTimeout(300);
      row.walkEnd = await page.evaluate(() => window.mf97.actual?.position);
      if (Math.hypot(start.x - row.walkEnd.x, start.z - row.walkEnd.z) < 0.1)
        throw Error("Native movement did not advance");
      // WASD enables native pointer capture. Escape releases capture while preserving walk mode.
      if (await page.evaluate(() => window.mf97.viewer.state.gamingControls))
        await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => !window.mf97.viewer.state.gamingControls,
        null,
        { timeout: 10000 },
      );
      await page.mouse.move(size.width - 80, size.height - 25);
      await page.waitForTimeout(150);
      if (await page.evaluate(() => window.mf97.viewer.state.controlsHidden))
        await page.keyboard.press("h");
      await page.mouse.move(size.width - 140, size.height - 25);
      await page.mouse.move(size.width - 80, size.height - 25);
      await page.waitForTimeout(100);
      await page.locator(".sse-settings").click();
      await page.getByRole("switch", { name: "导览模式", exact: true }).click();
      const before = await page.evaluate(() => window.mf97.actual?.position);
      await page.waitForTimeout(200);
      row.disabled = await page.evaluate(() => ({
        goal: window.mf97.viewer.state.guidanceTarget,
        map: window.mf97.viewer.state.guidanceMapVisible,
        position: window.mf97.actual?.position,
      }));
      if (
        row.disabled.goal !== null ||
        row.disabled.map !== true ||
        Math.hypot(
          before.x - row.disabled.position.x,
          before.y - row.disabled.position.y,
          before.z - row.disabled.position.z,
        ) > 0.01
      )
        throw Error("Guide disable changed movement or map");
      if (errors.length || consoleErrors.length)
        throw Error("Browser reported errors");
      row.passed = true;
    } catch (error) {
      row.failure = error.message;
      row.finalState = await page
        .evaluate(() => ({
          mode: window.mf97?.viewer.state.cameraMode,
          gaming: window.mf97?.viewer.state.gamingControls,
          hidden: window.mf97?.viewer.state.controlsHidden,
          input: window.mf97?.viewer.state.inputMode,
          goal: window.mf97?.viewer.state.guidanceTarget,
        }))
        .catch(() => null);
      await page
        .screenshot({ path: `${dir}/${name}-failure.png` })
        .catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${dir}/ui-browser.json`, JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
}

if (rows.some((row) => !row.passed)) process.exitCode = 1;
