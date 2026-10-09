import { loadAssetConfig } from "../../scripts/mf97/asset-config.mjs";
import { chromium } from "../../metaflow-viewer/node_modules/@playwright/test/index.mjs";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  statfsSync,
} from "node:fs";
import { resolve } from "node:path";
const root =
  process.env.MF97_CACHE_ROOT ??
  loadAssetConfig().roots.continuation;
const input = process.env.MF97_REVIEW_ROOT ?? resolve(root, "ground-v2"),
  output = resolve(root, "validation/ground-browser");
if (
  statfsSync(root).bavail * statfsSync(root).bsize <
  5 * 1024 ** 3 + 32 * 1024 ** 2
)
  throw Error("Prism reserve");
mkdirSync(output, { recursive: true });
const scene = process.env.SCENE ?? "apms-2026",
  axis = process.env.MF97_SECTION_AXIS ?? "z";
const entries = readdirSync(resolve(input, scene))
  .filter((f) => f.endsWith(".review.json"))
  .flatMap((file) => {
    const review = JSON.parse(
      readFileSync(resolve(input, scene, file), "utf8"),
    );
    return review.candidates.flatMap((candidate, index) =>
      candidate.edits.length ? [{ file, index, review, candidate }] : [],
    );
  })
  .sort((a, b) => a.candidate.edits.length - b.candidate.edits.length);
const requested =
  process.env.MF97_REVIEW_FILE ??
  (scene === "apms-2026" ? "chunk-00182.review.json" : undefined);
const requestedIndex = Number(process.env.MF97_CANDIDATE_INDEX ?? 30);
if (!entries.length) throw Error("No edits to inspect; keep zero accepted");
const entry =
    entries.find((e) => e.file === requested && e.index === requestedIndex) ??
    entries[0],
  tag = `${scene}-${entry.file.replace(".review.json", "")}-c${entry.index}-${axis}-${Date.now()}`,
  report = {
    scene,
    input,
    file: entry.file,
    candidate: entry.candidate.id,
    errors: [],
    passed: false,
  };
let page;
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--ignore-gpu-blocklist"],
});
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(
    (process.env.MF97_ORIGIN ?? "http://127.0.0.1:5185") +
      "/ground-review.html",
  );
  report.url = page.url();
  report.title = await page.title();
  await page.locator("#files").setInputFiles(resolve(input, scene, entry.file));
  await page.locator("#candidate").selectOption(String(entry.index));
  await page.waitForFunction(() =>
    document.querySelector("#verification").textContent.includes("SHA-256"),
  );
  report.policy = await page.locator("#policy").textContent();
  report.acceptDisabled = await page.locator("#accept").isDisabled();
  if (!report.acceptDisabled)
    throw Error("Accept enabled before current Gaussian evidence and reason");
  await page.locator("#section-axis").selectOption(axis);
  await page.locator("#section-render").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#section-status")
        .textContent.match(/^(已生成|剖面未完成)/),
    null,
    { timeout: 180000 },
  );
  if (
    !(await page.locator("#section-status").textContent()).startsWith("已生成")
  )
    throw Error(await page.locator("#section-status").textContent());
  report.section = await page.locator("#section-status").textContent();
  if (!(await page.locator("#accept").isDisabled()))
    throw Error("Accept enabled without written evidence reason");
  await page
    .locator("#decision-reason")
    .fill("UI gating test only; no real correction accepted");
  const current = report.policy.includes("算法指纹与当前服务一致");
  if ((await page.locator("#accept").isDisabled()) === current)
    throw Error("Current evidence/policy gate mismatch");
  await page
    .locator("#gaussian-section")
    .screenshot({ path: resolve(output, `${tag}-section-overlay.png`) });
  await page.locator("#section-overlay").uncheck();
  await page
    .locator("#gaussian-section")
    .screenshot({ path: resolve(output, `${tag}-section-gaussian.png`) });
  await page.locator("#section-axis").selectOption(axis === "z" ? "x" : "z");
  if (
    !(await page.locator("#section-status").textContent()).includes("尚未生成")
  )
    throw Error("Old section survived direction change");
  if (!(await page.locator("#accept").isDisabled()))
    throw Error("Old evidence enabled accept after direction change");
  await page.locator("#section-render").click();
  await page.locator("#section-cancel").click();
  await page.waitForTimeout(300);
  report.afterCancel = await page.locator("#section-status").textContent();
  if (report.afterCancel !== "已取消剖面生成。")
    throw Error("Cancellation left a running status");
  report.acceptedCount = await page.locator("#summary").textContent();
  if (!report.acceptedCount.includes("已接受 0"))
    throw Error("Browser test accepted real patch");
  report.passed = report.errors.length === 0;
  if (!report.passed) throw Error(report.errors.join("\n"));
} catch (error) {
  report.failure = error.message;
  report.sectionStatus = await page?.locator("#section-status").textContent();
  await page?.screenshot({ path: resolve(output, `${tag}-failure.png`) });
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    resolve(output, `${tag}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
