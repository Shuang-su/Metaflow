// Run after the MF97 preview and Studio build are available. This script starts
// one Chrome context at a time; do not run beside the Gaussian map generator.
// All edits use the actual Studio UI. The public events API only reads state.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const option = (name, fallback) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3) ?? fallback;
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(
  option(
    "output",
    process.env.MF97_STUDIO_OUTPUT ??
      `${projectRoot}/.codex-work/cache/mf97-navigation/evidence/studio`,
  ),
);
const url = option("url", "http://127.0.0.1:5185/studio/");
const prepareOnly = process.argv.includes("--prepare-only");
if (process.argv.includes("--help")) {
  console.log(
    "node mf97-viewer-trial/scripts/browser-studio.mjs [--url=http://127.0.0.1:5185/studio/] [--output=/absolute/evidence/directory] [--prepare-only]\nUses installed Chrome and the existing Playwright dependency. --prepare-only writes fixtures without launching a browser.",
  );
  process.exit(0);
}

const pose = { position: [0, 0, 5], target: [0, 0, 0], fov: 60 };
const originalExtras = {
  vendor: { version: 8, payload: ["中文扩展", { keep: true }] },
  metaflow: {
    owner: "preserve",
    nav: { enabled: false, future: { kind: "reserved" } },
  },
};
const fixture = {
  format: "metaflow-studio",
  version: 2,
  name: "MF97 Studio 回归",
  customProject: { preserve: ["unknown", 17] },
  assets: [],
  experience: {
    version: 2,
    tonemapping: "none",
    highPrecisionRendering: true,
    background: { color: [0.055, 0.065, 0.08] },
    postEffectSettings: {
      enabled: false,
      vendorEffect: { preserve: "effect metadata" },
    },
    cameras: [{ initial: pose }],
    animTracks: [],
    startMode: "default",
    annotations: [
      {
        position: [-0.9, 0.5, 0],
        title: "普通介绍",
        text: "正文不含命令",
        camera: { initial: pose },
        extras: originalExtras,
      },
    ],
    vendorSettings: { preserve: [false, 2, "unknown"] },
  },
  timeline: {
    frames: 181,
    frameRate: 30,
    frame: 0,
    smoothness: 1,
    loop: true,
    loopMode: "repeat",
  },
  video: { overlay: "off", selected: -1, vendorVideo: { preserve: true } },
};

// Same real binary PLY layout as Studio's existing calibration tests, with
// larger overlapping splats so the canvas centre provides a stable pick surface.
function calibrationPly() {
  const properties = [
    "x",
    "y",
    "z",
    "f_dc_0",
    "f_dc_1",
    "f_dc_2",
    "opacity",
    "scale_0",
    "scale_1",
    "scale_2",
    "rot_0",
    "rot_1",
    "rot_2",
    "rot_3",
  ];
  const points = [];
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) {
      points.push([
        (x - 14.5) * 0.1,
        (y - 9.5) * 0.1,
        0,
        0.7,
        0.2,
        -0.3,
        5,
        -2.6,
        -2.6,
        -2.6,
        1,
        0,
        0,
        0,
      ]);
    }
  const header = Buffer.from(
    `ply\nformat binary_little_endian 1.0\nelement vertex ${points.length}\n${properties.map((name) => `property float ${name}`).join("\n")}\nend_header\n`,
  );
  const data = Buffer.alloc(points.length * properties.length * 4);
  points.flat().forEach((value, index) => data.writeFloatLE(value, index * 4));
  return Buffer.concat([header, data]);
}

await mkdir(output, { recursive: true });
const fixtureFile = resolve(output, "mf97-nav-fixture.mfstudio.json");
const modelFile = resolve(output, "mf97-calibration.ply");
const modelBytes = calibrationPly();
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
await writeFile(fixtureFile, JSON.stringify(fixture, null, 2));
await writeFile(modelFile, modelBytes);
const result = {
  status: "prepared",
  url,
  output,
  filePickerMode:
    "real file-input / download fallback (native pickers disabled only in the test context)",
  fixtures: {
    project: fixtureFile,
    model: modelFile,
    splats: 600,
    modelBytes: modelBytes.length,
    modelSha256: sha256(modelBytes),
  },
  checks: [],
  pageErrors: [],
  consoleErrors: [],
};
const reportFile = resolve(output, "studio-browser.json");
if (prepareOnly) {
  await writeFile(reportFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const { chromium } =
  await import("../../metaflow-viewer/node_modules/@playwright/test/index.mjs");
let browser, activePage;
const snapshot = (page) =>
  page.evaluate(() => window.scene.events.invoke("studio.project"));
async function boot() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    // Existing Studio e2e tests use this supported file-input fallback too.
    window.showOpenFilePicker = undefined;
    window.showSaveFilePicker = undefined;
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") result.consoleErrors.push(message.text());
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.scene?.events?.functions.has("studio.project"),
    null,
    { timeout: 60000 },
  );
  await page.locator("#canvas").waitFor({ state: "visible" });
  return { context, page };
}
async function chooseFile(page, buttonName, file, menu = true) {
  if (menu) {
    const menuElement = page.locator(".studio-file-menu");
    if (!(await menuElement.evaluate((element) => element.open)))
      await menuElement.locator("summary").click();
  }
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await (await choosing).setFiles(file);
}
async function selectAnnotation(page, index) {
  await page.getByRole("tab", { name: "标记", exact: true }).click();
  if ((await snapshot(page)).video.selected !== index) {
    await page
      .locator(
        `.studio-annotation-row[data-annotation-index="${index}"] .studio-row-title`,
      )
      .click();
  }
  await page.waitForFunction(
    (index) =>
      window.scene.events.invoke("studio.project").video.selected === index,
    index,
  );
}
async function waitNav(page, index, enabled) {
  await page.waitForFunction(
    ({ index, enabled }) =>
      window.scene.events.invoke("studio.project").experience.annotations[index]
        ?.extras?.metaflow?.nav?.enabled === enabled,
    { index, enabled },
  );
  assert.equal(
    await page
      .getByRole("switch", { name: "@Nav 可导览", exact: true })
      .getAttribute("aria-checked"),
    String(enabled),
  );
}
async function downloadJson(page, buttonName, filename) {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const download = await downloading;
  const path = resolve(output, filename);
  await download.saveAs(path);
  assert.equal(await download.failure(), null);
  return {
    path,
    data: JSON.parse(await readFile(path, "utf8")),
    suggestedFilename: download.suggestedFilename(),
  };
}
function assertUnknown(project) {
  assert.deepEqual(project.customProject, fixture.customProject);
  assert.deepEqual(
    project.experience.vendorSettings,
    fixture.experience.vendorSettings,
  );
  assert.deepEqual(
    project.experience.postEffectSettings.vendorEffect,
    fixture.experience.postEffectSettings.vendorEffect,
  );
  assert.deepEqual(project.video.vendorVideo, fixture.video.vendorVideo);
  const expected = structuredClone(originalExtras);
  expected.metaflow.nav.enabled = true;
  assert.deepEqual(project.experience.annotations[0].extras, expected);
  assert.equal(project.experience.annotations[0].title, "普通介绍");
  assert.equal(project.experience.annotations[0].text, "正文不含命令");
}

try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const first = await boot();
  await chooseFile(first.page, "打开工程", fixtureFile);
  await first.page.waitForFunction(
    (name) => window.scene.events.invoke("studio.project").name === name,
    fixture.name,
  );
  assert.deepEqual(
    (await snapshot(first.page)).experience.annotations[0].extras,
    originalExtras,
  );
  result.checks.push(
    "UI opened the synthetic .mfstudio project and preserved unknown fields",
  );

  await chooseFile(first.page, "打开模型", modelFile);
  await first.page.waitForFunction(
    () => window.scene.events.invoke("scene.splats")[0]?.numSplats === 600,
    null,
    { timeout: 60000 },
  );
  await first.page
    .getByRole("button", { name: "重置相机", exact: true })
    .click();
  await first.page.waitForFunction(() => {
    const pose = window.scene.events.invoke("camera.getPose");
    return (
      Math.abs(pose.position.x) < 0.01 &&
      Math.abs(pose.position.y) < 0.01 &&
      Math.abs(pose.position.z - 5) < 0.01
    );
  });
  await first.page.getByRole("tab", { name: "标记", exact: true }).click();
  await first.page
    .getByRole("button", { name: "添加标记", exact: true })
    .click();
  const canvas = first.page.locator("#canvas");
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  await canvas.click({
    position: { x: bounds.width * 0.5, y: bounds.height * 0.5 },
  });
  await first.page.waitForFunction(
    () =>
      window.scene.events.invoke("studio.project").experience.annotations
        .length === 2,
  );
  await first.page
    .getByRole("textbox", { name: "标记标题", exact: true })
    .fill("新增目的地");
  await first.page
    .getByRole("textbox", { name: "说明文字", exact: true })
    .fill("点击模型表面创建，不写插件命令");
  await first.page
    .getByRole("button", { name: "确定标记", exact: true })
    .click();
  await first.page.waitForFunction(
    () =>
      window.scene.events.invoke("studio.project").experience.annotations[1]
        .title === "新增目的地",
  );
  const added = (await snapshot(first.page)).experience.annotations[1];
  assert.ok(added.position.every(Number.isFinite));
  assert.ok(added.camera.initial.position.every(Number.isFinite));
  assert.equal(added.extras, undefined);
  result.checks.push(
    "UI clicked the rendered calibration surface to add and edit an ordinary marker",
  );

  await selectAnnotation(first.page, 0);
  await waitNav(first.page, 0, false);
  await first.page
    .getByRole("switch", { name: "@Nav 可导览", exact: true })
    .click();
  await waitNav(first.page, 0, true);
  assertUnknown(await snapshot(first.page));
  await first.page.getByRole("button", { name: "撤销", exact: true }).click();
  await waitNav(first.page, 0, false);
  assert.deepEqual(
    (await snapshot(first.page)).experience.annotations[0].extras,
    originalExtras,
  );
  await first.page.getByRole("button", { name: "重做", exact: true }).click();
  await waitNav(first.page, 0, true);
  assertUnknown(await snapshot(first.page));
  result.checks.push(
    "UI selected the existing marker; @Nav toggle, undo and redo preserved every unknown metadata field",
  );

  await selectAnnotation(first.page, 1);
  assert.equal(
    await first.page
      .getByRole("switch", { name: "@Nav 可导览", exact: true })
      .getAttribute("aria-checked"),
    "false",
  );
  await first.page
    .getByRole("switch", { name: "@Nav 可导览", exact: true })
    .click();
  await waitNav(first.page, 1, true);
  await first.page.screenshot({
    path: resolve(output, "studio-nav-enabled.png"),
  });
  const settings = await downloadJson(
    first.page,
    "导出展示设置",
    "exported-settings.json",
  );
  const saved = await downloadJson(
    first.page,
    "保存工程",
    "saved.mfstudio.json",
  );
  assertUnknown(saved.data);
  assert.deepEqual(settings.data, saved.data.experience);
  assert.equal(
    saved.data.experience.annotations[1].extras.metaflow.nav.enabled,
    true,
  );
  result.downloads = { project: saved.path, settings: settings.path };
  result.checks.push(
    "UI enabled @Nav for the new marker and downloaded matching project/settings JSON",
  );
  await first.context.close();
  activePage = undefined;

  // A fresh context proves the saved JSON, rather than the previous in-memory
  // document or file handles, is sufficient to recover the metadata.
  const reopened = await boot();
  await chooseFile(reopened.page, "打开工程", saved.path);
  await reopened.page.waitForFunction(
    (name) => window.scene.events.invoke("studio.project").name === name,
    fixture.name,
  );
  assertUnknown(await snapshot(reopened.page));
  assert.deepEqual(
    (await snapshot(reopened.page)).experience,
    saved.data.experience,
  );
  assert.equal(
    await reopened.page.evaluate(
      () => window.scene.events.invoke("scene.splats").length,
    ),
    0,
  );
  await chooseFile(reopened.page, "重新定位资产", modelFile);
  await reopened.page.waitForFunction(
    () => window.scene.events.invoke("scene.splats")[0]?.numSplats === 600,
    null,
    { timeout: 60000 },
  );
  assert.deepEqual(
    (await snapshot(reopened.page)).experience,
    saved.data.experience,
  );
  result.checks.push(
    "UI cold-reopened the saved project and relinked the tiny PLY without changing metadata",
  );

  await selectAnnotation(reopened.page, 0);
  await reopened.page
    .getByRole("switch", { name: "@Nav 可导览", exact: true })
    .click();
  await waitNav(reopened.page, 0, false);
  await chooseFile(reopened.page, "导入展示设置", settings.path, false);
  await reopened.page
    .locator("#popup")
    .getByRole("button", { name: "导入", exact: true })
    .click();
  await reopened.page.waitForFunction(
    () =>
      window.scene.events.invoke("studio.project").experience.annotations[0]
        ?.extras?.metaflow?.nav?.enabled === true,
  );
  assertUnknown(await snapshot(reopened.page));
  assert.deepEqual((await snapshot(reopened.page)).experience, settings.data);
  await selectAnnotation(reopened.page, 0);
  await waitNav(reopened.page, 0, true);
  await reopened.page.screenshot({
    path: resolve(output, "studio-nav-roundtrip.png"),
  });
  result.checks.push(
    "UI reimported exported settings over an edited document and restored @Nav true plus unknown metadata",
  );
  assert.equal(sha256(await readFile(modelFile)), result.fixtures.modelSha256);
  assert.deepEqual(JSON.parse(await readFile(fixtureFile, "utf8")), fixture);
  assert.deepEqual(result.pageErrors, []);
  assert.deepEqual(result.consoleErrors, []);
  result.checks.push(
    "Synthetic source files remained unchanged and both contexts reported no browser errors",
  );
  await reopened.context.close();
  activePage = undefined;
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.failure = { message: error.message, stack: error.stack };
  if (activePage && !activePage.isClosed()) {
    result.lastState = await snapshot(activePage).catch(() => null);
    result.visibleStatus = await activePage
      .locator(".studio-status")
      .allTextContents()
      .catch(() => []);
    await activePage
      .screenshot({ path: resolve(output, "studio-failure.png") })
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(reportFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
