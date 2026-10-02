/** Re-run original-source regression into a new evidence directory, never old reports. */
import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createOfflineResources,
  offlineResourceOptions,
} from "../src/offline-resources";
const resources = createOfflineResources(offlineResourceOptions()),
  project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const corrected = !!process.env.MF79_REPLAY_ASSETS;
const runRoot = resources.resolveOutput(process.env.MF97_REGRESSION_OUTPUT ?? (corrected ? "validation/corrected-regression" : "validation/regression")),
  original = resolve(project, "mf79-viewer-trial");
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
// Freeze the actual local import closure before execution, not after the results exist.
const implementationFiles = new Set<string>();
const collect = (file: string) => {
  if (implementationFiles.has(file)) return;
  implementationFiles.add(file);
  if (!file.endsWith(".ts")) return;
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'](\.[^"']+)["']/g)) {
    const base = resolve(dirname(file), match[1]);
    const dependency = [base + ".ts", resolve(base, "index.ts"), base].find(v => existsSync(v) && /\.(ts|json)$/.test(v));
    if (dependency) collect(dependency);
  }
};
for (const name of ["source.ts", "region-regression.ts", "replay.ts", "legacy-routes.ts"]) collect(resolve(original, "scripts", name));
collect(fileURLToPath(import.meta.url));
for (const name of ["mf79-viewer-trial/package-lock.json", "metaflow-viewer/package-lock.json"])
  if (existsSync(resolve(project, name))) collect(resolve(project, name));
const implementation = [...implementationFiles].sort().map(file => ({ file: relative(project, file), sha256: sha(file) }));
const replayAssets = corrected ? JSON.parse(readFileSync(process.env.MF79_REPLAY_ASSETS!, "utf8")) : {};
const inputFiles = ["scene-exhibitions.json", "apms-markers-42.mfstudio.json", "sdi-25.settings.json"].map(v => resolve(original, v));
if (corrected) inputFiles.push(resolve(process.env.MF79_REPLAY_ASSETS!));
for (const scene of ["apms-2026", "sdi-2026"]) inputFiles.push(resolve(replayAssets[scene]?.navigation ?? `/Volumes/Prism/Metaflow/.codex-work/cache/mf79-native-viewer-v1/${scene}`, "manifest.json"));
const manifestHashes = inputFiles.map(file => ({ file, sha256: sha(file) }));
resources.assertCapacity(32 * 1024 ** 2, "source-bound regression");
if (existsSync(resolve(runRoot, "summary.json"))) throw Error("Completed evidence exists; select a new MF97_REGRESSION_OUTPUT directory");
mkdirSync(resolve(runRoot, "docs"), { recursive: true });
for (const file of [
  "scene-exhibitions.json",
  "apms-markers-42.mfstudio.json",
  "sdi-25.settings.json",
])
  resources.writeFileAtomic(
    resolve(runRoot, file),
    readFileSync(resolve(original, file)),
    { replace: false },
  );
const command = (script: string, args: string[]) => {
  const start = Date.now(),
    result = spawnSync(
      process.execPath,
      [
        resolve(original, "node_modules/tsx/dist/cli.mjs"),
        resolve(original, "scripts", script),
        ...args,
      ],
      { cwd: runRoot, encoding: "utf8", maxBuffer: 8 * 1024 ** 2 },
    );
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.status !== 0)
    throw Error(`${script} ${args.join(" ")} failed (${result.status})`);
  return { script, args, ms: Date.now() - start };
};
const runs = [];
for (const scene of ["apms-2026", "sdi-2026"]) {
  runs.push(command("region-regression.ts", [scene]));
  runs.push(command("replay.ts", [scene, "--region"]));
}
runs.push(command("legacy-routes.ts", []));
const apms = JSON.parse(
  readFileSync(resolve(runRoot, "docs/region-replay-apms-2026.json"), "utf8"),
);
const sdi = JSON.parse(
  readFileSync(resolve(runRoot, "docs/region-replay-sdi-2026.json"), "utf8"),
);
const legacy = JSON.parse(
  readFileSync(resolve(runRoot, "docs/legacy-seven.json"), "utf8"),
);
const fixed = [
  1, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 19, 20, 21, 22, 23, 24, 25,
];
const summary = {
  source: corrected ? "explicit accepted collision/navigation bundle" : "original unchanged collision",
  replayAssets: corrected ? replayAssets : null,
  implementation,
  manifestHashes,
  evidenceFiles: readdirSync(resolve(runRoot, "docs")).filter(f => f.endsWith(".json")).sort().map(name => {
    const file = resolve(runRoot, "docs", name);
    return { file, sha256: sha(file) };
  }),
  runs,
  apms: {
    total: 42,
    passed: apms.rows.filter((r: any) => r.status === "replayed").length,
  },
  sdi: {
    total: 25,
    passed: sdi.rows.filter((r: any) => r.status === "replayed").length,
  },
  fixed20: {
    total: 20,
    passed: sdi.rows.filter(
      (r: any) => fixed.includes(r.index) && r.status === "replayed",
    ).length,
  },
  legacy7: {
    total: 7,
    passed: legacy.rows.filter(
      (r: any) =>
        r.cohort === "legacy-seven" && r.status === "native-walking-passed",
    ).length,
  },
  correctedSource: corrected,
};
for (const record of [...implementation.map(v => ({ ...v, file: resolve(project, v.file) })), ...manifestHashes])
  if (sha(record.file) !== record.sha256) throw Error(`Regression input changed during execution: ${record.file}`);
resources.writeJsonAtomic(resolve(runRoot, "summary.json"), summary);
console.log(JSON.stringify(summary));
if (
  summary.apms.passed !== 42 ||
  summary.sdi.passed !== 25 ||
  summary.fixed20.passed !== 20 ||
  summary.legacy7.passed !== 7
)
  throw Error("Original regression failed");
