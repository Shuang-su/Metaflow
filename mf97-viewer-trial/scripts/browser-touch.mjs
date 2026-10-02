import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import { createOfflineResources } from "../src/offline-resources.ts";

const resources = createOfflineResources(),
  output = "validation/touch/touch-browser.json";
resources.assertCapacity(
  2 * 1024 * 1024,
  "desktop Chrome touch emulation evidence",
);
const origin = process.env.MF97_ORIGIN ?? "http://127.0.0.1:5186";
const report = {
  passed: false,
  generatedAt: new Date().toISOString(),
  origin,
  platform:
    "Desktop Chrome CDP touch emulation; not a physical mobile-device test",
  viewport: { width: 390, height: 844 },
  tests: [],
  errors: [],
};
if (existsSync(resolve(resources.root, output))) {
  const { previousAttempts = [], ...previous } = JSON.parse(
    readFileSync(resolve(resources.root, output), "utf8"),
  );
  report.previousAttempts = [...previousAttempts, previous];
}
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--ignore-gpu-blocklist"],
});
let page;
try {
  const context = await browser.newContext({
    viewport: report.viewport,
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    localStorage.setItem("guidanceMode", "true");
    localStorage.setItem("guidanceMapVisible", "true");
    // Observe actual 2D draw coordinates without exposing or writing map state.
    const clear = CanvasRenderingContext2D.prototype.clearRect,
      draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.closest(".sse-guidanceMap")) window.__touchMapDraw = [];
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.closest(".sse-guidanceMap"))
        (window.__touchMapDraw ??= []).push({
          source: args[0].currentSrc ?? args[0].src ?? "image",
          rect: args.slice(1),
        });
      return draw.apply(this, args);
    };
    window.__touchPointerLog = [];
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ])
      document.addEventListener(
        type,
        (event) => {
          if (event.target.closest?.(".sse-guidanceMap canvas"))
            window.__touchPointerLog.push({
              type,
              pointerType: event.pointerType,
              id: event.pointerId,
              isTrusted: event.isTrusted,
            });
        },
        true,
      );
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await page.goto(`${origin}/?scene=apms-2026&mixed=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => window.mf97?.viewer.state.loaded && window.__touchMapDraw?.length,
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(500);
  const state = () =>
    page.evaluate(() => {
      const component = window.mf97.viewer.app.root
        .findComponents("camera")
        .find((value) => value.enabled && value.entity.enabled);
      const position = component.entity.getPosition(),
        rotation = component.entity.getEulerAngles(),
        forward = component.entity.forward;
      return {
        camera: {
          position: [position.x, position.y, position.z],
          angles: [rotation.x, rotation.y, rotation.z],
          forward: [forward.x, forward.y, forward.z],
          fov: component.fov,
        },
        actual: window.mf97.actual ? { ...window.mf97.actual.position } : null,
        mode: window.mf97.viewer.state.cameraMode,
        target: window.mf97.viewer.state.guidanceTarget,
        selected: window.mf97.viewer.state.selectedAnnotation,
        arrivalCount: window.mf97.evidence.filter((value) => value.arrival)
          .length,
        map: window.__touchMapDraw,
        status: window.mf97.viewer.state.guidanceStatus,
      };
    });
  const stable = (before, after) => {
    assert.equal(after.mode, before.mode);
    assert.equal(after.target, before.target);
    assert.equal(after.selected, before.selected);
    assert.equal(after.arrivalCount, before.arrivalCount);
    for (const key of ["x", "y", "z"])
      assert.ok(
        Math.abs(after.actual[key] - before.actual[key]) < 0.002,
        `Touch changed native ${key}`,
      );
    for (const key of ["position", "forward", "angles"])
      after.camera[key].forEach((value, index) =>
        assert.ok(
          Math.abs(value - before.camera[key][index]) < 0.002,
          `Touch changed camera ${key}`,
        ),
      );
    assert.ok(
      Math.abs(after.camera.fov - before.camera.fov) < 0.0001,
      "Touch changed camera FOV",
    );
  };
  const touch = async (type, points) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((point) => ({
        ...point,
        radiusX: 4,
        radiusY: 4,
        force: 1,
      })),
    });
  const tap = async (locator) => {
    await locator.waitFor({ state: "visible" });
    const box = await locator.boundingBox();
    assert.ok(
      box && box.width > 0 && box.height > 0,
      "Touch target needs a visible rectangle",
    );
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    assert.ok(
      x > 0 && x < 390 && y > 0 && y < 844,
      "Touch target is outside viewport",
    );
    await touch("touchStart", [{ id: 8, x, y }]);
    await page.waitForTimeout(40);
    await touch("touchEnd", []);
  };
  const canvas = page.locator(".sse-guidanceMap canvas");
  console.log(
    "TOUCH: native Viewer loaded; opening target menu with CDP touch",
  );
  await tap(page.locator(".sse-annotationInfo"));
  await page
    .locator('.sse-annotationMenuItem[data-annotation-index="1"]')
    .waitFor({ state: "visible" });
  const beforeSelect = await state();
  await tap(page.locator('.sse-annotationMenuItem[data-annotation-index="1"]'));
  await page.waitForFunction(
    () =>
      window.mf97.viewer.state.guidanceTarget === 1 &&
      window.mf97.actual?.grounded &&
      window.mf97.actual.collision === "active",
  );
  const afterSelect = await state();
  assert.equal(afterSelect.target, 1);
  // Selecting guidance enters native walk from the initial paused animation.
  // Native grounding may adjust Y; the distant destination must not teleport XZ.
  assert.ok(
    Math.hypot(
      afterSelect.actual.x - beforeSelect.camera.position[0],
      afterSelect.actual.z - beforeSelect.camera.position[2],
    ) < 0.1,
    "Menu selection teleported the native visitor to the destination",
  );
  report.tests.push({
    name: "trusted touch selects a navigation menu target without teleporting",
    passed: true,
    before: beforeSelect,
    after: afterSelect,
  });
  await page.waitForFunction(
    () =>
      window.mf97.evidence.some((value) =>
        ["route", "exhausted", "error"].includes(value.type),
      ),
    null,
    { timeout: 120000 },
  );
  // Let the native mode-entry FOV transition finish before testing isolation.
  // This observes the real camera; it never writes pose, movement or animation.
  await page.waitForFunction(
    () => {
      const camera = window.mf97.viewer.app.root
        .findComponents("camera")
        .find((value) => value.enabled && value.entity.enabled);
      const position = camera.entity.getPosition(),
        rotation = camera.entity.getEulerAngles();
      const key = [
        position.x,
        position.y,
        position.z,
        rotation.x,
        rotation.y,
        rotation.z,
        camera.fov,
      ]
        .map((value) => value.toFixed(6))
        .join(",");
      const previous = window.__touchStablePose;
      window.__touchStablePose = {
        key,
        count: previous?.key === key ? previous.count + 1 : 0,
      };
      return window.__touchStablePose.count >= 3;
    },
    null,
    { timeout: 10000, polling: 100 },
  );
  const box = await canvas.boundingBox(),
    cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  let before = await state();
  await touch("touchStart", [{ id: 1, x: cx - 20, y: cy - 8 }]);
  for (let step = 1; step <= 8; step++) {
    await touch("touchMove", [
      { id: 1, x: cx - 20 + step * 5, y: cy - 8 + step * 2 },
    ]);
    await page.waitForTimeout(30);
  }
  await touch("touchEnd", []);
  await page.waitForTimeout(120);
  let after = await state();
  stable(before, after);
  const tile = after.map.find((entry) => entry.source === before.map[0].source);
  assert.ok(tile, "The same Gaussian tile remains observable after drag");
  assert.ok(
    Math.hypot(
      tile.rect[0] - before.map[0].rect[0],
      tile.rect[1] - before.map[0].rect[1],
    ) > 20,
    "Trusted touch drag did not pan the map",
  );
  assert.ok(
    Math.abs(tile.rect[2] / before.map[0].rect[2] - 1) < 0.001,
    "Single touch changed map scale",
  );
  report.tests.push({
    name: "one-finger touch drag pans only the map",
    passed: true,
    before,
    after,
  });
  console.log(
    "TOUCH: drag isolated from native pose; sending simultaneous two-finger pinch",
  );
  before = await state();
  await touch("touchStart", [
    { id: 2, x: cx - 18, y: cy },
    { id: 3, x: cx + 18, y: cy },
  ]);
  for (let step = 1; step <= 8; step++) {
    await touch("touchMove", [
      { id: 2, x: cx - 18 - step * 3, y: cy },
      { id: 3, x: cx + 18 + step * 3, y: cy },
    ]);
    await page.waitForTimeout(30);
  }
  await touch("touchEnd", []);
  await page.waitForTimeout(120);
  after = await state();
  stable(before, after);
  const scaled = after.map.find(
    (entry) => entry.source === before.map[0].source,
  );
  assert.ok(
    scaled.rect[2] / before.map[0].rect[2] > 1.5,
    "Two-finger separation did not zoom the map",
  );
  report.tests.push({
    name: "simultaneous two-finger touch pinch zooms only the map",
    passed: true,
    scaleRatio: scaled.rect[2] / before.map[0].rect[2],
    before,
    after,
  });
  const beforeCancel = await state();
  await tap(page.locator(".sse-guidanceCancel"));
  await page.waitForFunction(
    () => window.mf97.viewer.state.guidanceTarget === null,
  );
  const afterCancel = await state();
  stable(
    { ...beforeCancel, target: null, selected: afterCancel.selected },
    afterCancel,
  );
  assert.equal(await page.locator(".sse-guidanceMap canvas").isVisible(), true);
  report.tests.push({
    name: "trusted touch cancels guidance while retaining native pose and visible map",
    passed: true,
    before: beforeCancel,
    after: afterCancel,
  });
  report.pointerEvents = await page.evaluate(() => window.__touchPointerLog);
  assert.ok(
    report.pointerEvents.filter((event) => event.type === "pointerdown")
      .length >= 3,
  );
  assert.ok(report.pointerEvents.some((event) => event.type === "pointermove"));
  assert.ok(
    report.pointerEvents.every(
      (event) => event.pointerType === "touch" && event.isTrusted,
    ),
  );
  assert.deepEqual(report.errors, []);
  resources.writeFileAtomic(
    "validation/touch/touch-map.png",
    await canvas.screenshot(),
  );
  report.passed = true;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
  if (page) {
    report.finalState = await page
      .evaluate(() => ({
        state: window.mf97?.viewer.state,
        actual: window.mf97?.actual,
      }))
      .catch(() => null);
    try {
      resources.writeFileAtomic(
        "validation/touch/failure.png",
        await page.screenshot(),
      );
    } catch {
      /* Retain the primary error. */
    }
  }
} finally {
  await browser.close();
  resources.writeJsonAtomic(output, report);
  console.log(
    JSON.stringify({
      passed: report.passed,
      tests: report.tests.map(({ name, passed, scaleRatio }) => ({
        name,
        passed,
        scaleRatio,
      })),
      errors: report.errors,
      finalState: report.finalState,
      output: resolve(resources.root, output),
    }),
  );
}
