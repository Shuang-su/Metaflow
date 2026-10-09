import { loadAssetConfig, resolveAssetUrl } from "../../scripts/mf97/asset-config.mjs";
/** Read-only original Gaussian views at native-proof poses. Never publishes a floor catalog. */
import assert from "node:assert/strict";
import { readFileSync, statSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, dirname } from "node:path";
import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import { createOfflineResources } from "../src/offline-resources.ts";

const resources = createOfflineResources(),
  origin = process.env.MF97_ORIGIN ?? "http://127.0.0.1:5185";
resources.assertCapacity(
  8 * 1024 ** 2,
  "Dayun three local Gaussian inspection frames",
);
const root = realpathSync(resolveAssetUrl("/repository-data/Shenzhen/250917%20Dayun"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const proofBytes = readFileSync(
  resolve(resources.root, "dayun/recast-proof/x10-z20-v4.json"),
);
const manifestBytes = readFileSync(resolve(root, "lod-meta.json")),
  manifest = JSON.parse(manifestBytes.toString());
const sourceFile = (file) => {
  const path = realpathSync(resolve(root, file));
  assert.ok(
    !relative(root, path).startsWith(".."),
    "Source reference outside original Gaussian directory",
  );
  assert.ok(statSync(path).isFile());
  return path;
};
const metadataFiles = new Set(),
  files = new Set(["lod-meta.json"]);
let sourceLeaves = 0,
  sourceSplats = 0;
const visit = (node) => {
  if (node.children) return node.children.forEach(visit);
  sourceLeaves++;
  const lod = node.lods?.[0];
  assert.ok(lod, "Missing original LOD0 leaf reference");
  if (lod.count) {
    assert.ok(manifest.filenames[lod.file]);
    metadataFiles.add(manifest.filenames[lod.file]);
    sourceSplats += lod.count;
  }
};
visit(manifest.tree);
for (const file of metadataFiles) {
  files.add(file);
  const meta = JSON.parse(readFileSync(sourceFile(file), "utf8"));
  const textures = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.files))
      for (const texture of value.files) {
        const child = relative(root, resolve(root, dirname(file), texture));
        sourceFile(child);
        files.add(child);
      }
    for (const [key, child] of Object.entries(value))
      if (key !== "files") textures(child);
  };
  textures(meta);
}
const report = {
  passed: false,
  scope:
    "Three local original LOD0 Gaussian inspection views; no building floor identity or navigation catalog accepted",
  proofHash: hash(proofBytes),
  manifestHash: hash(manifestBytes),
  lod0ReferenceAudit: {
    sourceLeaves,
    sourceSplats,
    metadataFiles: metadataFiles.size,
    referencedFiles: files.size,
    allExist: true,
    allFilesDecoded: false,
  },
  rows: [],
};
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--ignore-gpu-blocklist"],
});
try {
  for (const view of (
    process.env.MF97_DAYUN_VIEWS ?? "overlap-low,overlap-high"
  ).split(",")) {
    assert.ok(
      ["a", "b", "connection", "overlap-low", "overlap-high"].includes(view),
    );
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await context.addInitScript(() => {
      localStorage.setItem("guidanceMode", "false");
      localStorage.setItem("guidanceMapVisible", "false");
    });
    const page = await context.newPage(),
      row = {
        view,
        errors: [],
        failedResponses: [],
        consoleErrors: [],
        requests: 0,
        responses: 0,
      };
    report.rows.push(row);
    // Only the explicit source-audit fetch may read the whole original index.
    // The engine must parse our Blob index; refuse a regression that re-fetches
    // the complete source index before it can select hundreds of files.
    let originalIndexRequests = 0;
    await page.route(
      "**/repository-data/Shenzhen/250917%20Dayun/lod-meta.json",
      async (route) => {
        originalIndexRequests++;
        if (
          originalIndexRequests !== 1 ||
          route.request().resourceType() !== "fetch"
        ) {
          row.errors.push(
            "Full original index was requested by the engine instead of the local Blob index",
          );
          await route.abort();
          return;
        }
        await route.continue();
      },
    );
    page.on("pageerror", (error) => row.errors.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        row.consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      if (request.url().includes("repository-data")) row.requests++;
    });
    page.on("response", (response) => {
      if (response.url().includes("repository-data")) row.responses++;
      if (!response.ok() && response.url().includes("repository-data"))
        row.failedResponses.push({
          url: response.url(),
          status: response.status(),
        });
    });
    try {
      console.log("Inspecting Dayun local LOD0", view);
      await page.goto(`${origin}/?scene=dayun&dayunView=${view}`, {
        waitUntil: "domcontentloaded",
      });
      for (let attempt = 0; attempt < 90; attempt++) {
        row.loadState = await page.evaluate(() => {
          const v = window.mf97?.viewer;
          if (!v) return null;
          const s = v.state,
            tree = v.app.root.findComponents("gsplat")[0]?.resource?.octree;
          return {
            loaded: s.loaded,
            stage: s.loadingStage,
            status: s.loadingStatus,
            ready: s.readyToRender,
            splats: v.app.stats.frame.gsplats,
            loadedFiles: tree?.fileResources.size,
          };
        });
        if (row.loadState?.loaded) break;
        if (attempt % 10 === 0)
          console.log(
            JSON.stringify({
              view,
              attempt,
              load: row.loadState,
              requests: row.requests,
              responses: row.responses,
            }),
          );
        await page.waitForTimeout(2000);
      }
      assert.equal(
        row.loadState?.loaded,
        true,
        "Viewer did not reach loaded state",
      );
      row.render = await page.evaluate(async () => {
        const { viewer, dayunInspection } = window.mf97,
          app = viewer.app;
        const wasAutoRender = app.autoRender;
        app.autoRender = true;
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => finish(Error("LOD0 ready/decoded wait timed out")),
            90000,
          );
          let stable = 0;
          const finish = (value) => {
            clearTimeout(timer);
            app.systems.gsplat.off("frame:ready", ready);
            app.autoRender = wasAutoRender;
            value instanceof Error ? reject(value) : resolve(value);
          };
          const ready = (_camera, _layer, ok, loading) => {
            const splat = app.root.findComponents("gsplat")[0],
              tree = splat?.resource?.octree;
            const active = tree
              ? tree.files.flatMap((file, index) =>
                  tree.fileRefCounts[index] > 0
                    ? [
                        {
                          url: file.url,
                          lod: file.lodLevel,
                          loaded: tree.fileResources.has(index),
                          splats: tree.fileResources.get(index)?.numSplats ?? 0,
                        },
                      ]
                    : [],
                )
              : [];
            if (
              ok &&
              loading === 0 &&
              app.stats.frame.gsplats > 0 &&
              splat.lodRangeMin === 0 &&
              splat.lodRangeMax === 0 &&
              active.length &&
              active.every(
                (file) => file.loaded && file.lod === 0 && file.splats > 0,
              )
            )
              stable++;
            else stable = 0;
            if (stable >= 3) {
              const c = app.root
                  .findComponents("camera")
                  .find((c) => c.enabled && c.entity.enabled),
                p = c.entity.getPosition();
              finish({
                inspection: dayunInspection,
                backend: app.graphicsDevice.isWebGPU ? "webgpu" : "other",
                renderedSplats: app.stats.frame.gsplats,
                ready: ok,
                loading,
                activeDecodedFiles: active,
                position: { x: p.x, y: p.y, z: p.z },
                forward: {
                  x: c.entity.forward.x,
                  y: c.entity.forward.y,
                  z: c.entity.forward.z,
                },
                farClip: c.farClip,
                mode: viewer.state.cameraMode,
                animationPaused: viewer.state.animationPaused,
                goal: viewer.state.guidanceTarget,
              });
            }
            app.renderNextFrame = true;
          };
          app.systems.gsplat.on("frame:ready", ready);
          app.renderNextFrame = true;
        });
      });
      assert.equal(
        row.render.inspection.proofHash,
        view.startsWith("overlap-")
          ? hash(
              readFileSync(
                resolve(resources.root, "dayun/overlap-native-x16-z8.json"),
              ),
            )
          : report.proofHash,
      );
      assert.equal(row.render.inspection.view, view);
      assert.equal(row.render.inspection.actualSourceMatches, true);
      assert.equal(
        row.render.inspection.originalManifestHash,
        report.manifestHash,
      );
      assert.ok(
        row.render.inspection.coverage.selectedLeaves <
          report.lod0ReferenceAudit.sourceLeaves,
      );
      assert.equal(row.render.backend, "webgpu");
      assert.ok(
        row.render.mode === "fly" ||
          (row.render.mode === "anim" && row.render.animationPaused === true),
        "Inspection must remain stationary",
      );
      assert.equal(row.render.farClip, 6);
      assert.equal(row.render.goal, null);
      const expectedPose = row.render.inspection.pose;
      const nativeProof = view.startsWith("overlap-")
        ? JSON.parse(
            readFileSync(
              resolve(resources.root, "dayun/overlap-native-x16-z8.json"),
            ),
          )
        : JSON.parse(proofBytes);
      const nativePosition = view.startsWith("overlap-")
        ? nativeProof.endpoints.find(
            (p) => p.name === (view === "overlap-low" ? "lower" : "upper"),
          ).state.position
        : view === "a"
          ? nativeProof.proofs[0].from
          : view === "b"
            ? nativeProof.proofs[0].to
            : nativeProof.proofs[0].forward.trace[2400].position;
      for (const [axis, index] of [
        ["x", 0],
        ["y", 1],
        ["z", 2],
      ]) {
        assert.ok(
          Math.abs(row.render.position[axis] - nativePosition[axis]) < 1e-4,
          "Camera left proven native station",
        );
        assert.ok(
          Math.abs(expectedPose.position[index] - nativePosition[axis]) < 1e-4,
          "Configured station differs from proof",
        );
      }
      const direction = expectedPose.target.map(
          (v, i) => v - expectedPose.position[i],
        ),
        norm = Math.hypot(...direction);
      const alignment = ["x", "y", "z"].reduce(
        (n, axis, i) => n + (row.render.forward[axis] * direction[i]) / norm,
        0,
      );
      assert.ok(
        alignment > 1 - 1e-6,
        "Camera direction differs from inspection view",
      );
      assert.ok(
        row.render.inspection.decode.splats <=
          row.render.inspection.decode.limit,
      );
      assert.equal(
        row.render.activeDecodedFiles.reduce((n, file) => n + file.splats, 0),
        row.render.inspection.decode.splats,
      );
      assert.deepEqual(row.errors, []);
      assert.deepEqual(row.failedResponses, []);
      row.image = `validation/dayun-view/${view}.png`;
      resources.writeFileAtomic(
        row.image,
        await page.locator("#viewer canvas").first().screenshot(),
      );
      row.passed = true;
      console.log(
        JSON.stringify({
          view,
          activeDecoded: row.render.activeDecodedFiles.length,
          splats: row.render.renderedSplats,
          position: row.render.position,
        }),
      );
    } catch (error) {
      row.error = error.stack ?? String(error);
      try {
        resources.writeFileAtomic(
          `validation/dayun-view/${view}-failed.png`,
          await page.screenshot({ timeout: 10000 }),
        );
      } catch {}
      throw error;
    } finally {
      await context.close();
    }
  }
  report.passed = true;
} catch (error) {
  report.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  resources.writeJsonAtomic(
    `validation/dayun-view/inspection-${Date.now()}.json`,
    report,
    { replace: false },
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      rows: report.rows.map((row) => ({
        view: row.view,
        passed: row.passed,
        error: row.error,
      })),
      audit: report.lod0ReferenceAudit,
    }),
  );
}
