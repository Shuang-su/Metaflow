/** One heavy process at a time, with a measured-machine heap budget. */
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  unlinkSync,
  statfsSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { loadAssetConfig, machineLimits, GiB } from "./asset-config.mjs";

const config = loadAssetConfig(),
  limits = machineLimits();
if (!config.configured)
  throw Error(
    "Create the local asset configuration before starting a heavy job",
  );
const args = process.argv.slice(2);
if (!args.length || args[0].startsWith("-"))
  throw Error("Usage: node scripts/mf97/run-job.mjs <node-script> [arguments]");
const directory = resolve(config.roots.continuation, "job-control");
mkdirSync(directory, { recursive: true });
const lock = resolve(directory, "heavy.lock");
if (existsSync(lock)) {
  const previous = JSON.parse(readFileSync(lock, "utf8"));
  if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0)
    throw Error("Unknown job lock; preserve it for inspection");
  let dead = false;
  try {
    process.kill(previous.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") dead = true;
    else throw error;
  }
  if (!dead) throw Error(`Heavy job ${previous.pid} is still active`);
  renameSync(lock, `${lock}.interrupted-${previous.pid}-${Date.now()}`);
}
const handle = openSync(lock, "wx");
const record = {
  pid: process.pid,
  script: args[0],
  startedAt: new Date().toISOString(),
  profile: config.profile,
  limits,
};
writeFileSync(handle, JSON.stringify(record));
closeSync(handle);
const heap = limits.heapGiB
  ? [`--max-old-space-size=${Math.floor(limits.heapGiB * 1024)}`]
  : [];
const child = spawn(process.execPath, [...heap, ...args], {
  stdio: "inherit",
  detached: true,
  env: { ...process.env, MF_ASSET_CONFIG: config.file },
});
let failure,
  peakRssBytes = 0;
const stop = (signal) => {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
const monitor = setInterval(() => {
  if (!child.pid || failure) return;
  try {
    const rows = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], {
      encoding: "utf8",
      timeout: 2000,
    })
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number));
    const pids = new Set([child.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [pid, parent] of rows)
        if (pids.has(parent) && !pids.has(pid)) {
          pids.add(pid);
          changed = true;
        }
    }
    const rss = rows
      .filter(([pid]) => pids.has(pid))
      .reduce((sum, [, , kib]) => sum + kib * 1024, 0);
    peakRssBytes = Math.max(peakRssBytes, rss);
    const disk = statfsSync(directory);
    if (rss > limits.maxRssGiB * GiB)
      throw Error(
        "Heavy process tree exceeded the measured-machine RSS budget",
      );
    if (disk.bavail * disk.bsize < limits.reserveGiB * GiB)
      throw Error("Heavy job would violate the configured disk reserve");
  } catch (error) {
    failure = error;
    stop("SIGTERM");
    setTimeout(() => stop("SIGKILL"), 3000).unref();
  }
}, 1000);
let finished = false;
function finish(code, error) {
  if (finished) return;
  finished = true;
  clearInterval(monitor);
  if (failure) code = 1;
  const output = {
    ...record,
    endedAt: new Date().toISOString(),
    code,
    peakRssBytes,
    error: (failure ?? error)?.message,
  };
  writeFileSync(
    resolve(directory, `job-${record.pid}-${Date.now()}.json`),
    JSON.stringify(output, null, 2),
  );
  if (
    existsSync(lock) &&
    JSON.parse(readFileSync(lock, "utf8")).pid === process.pid
  )
    unlinkSync(lock);
  process.exitCode = code;
}
child.on("error", (error) => finish(1, error));
child.on("exit", (code, signal) => finish(code ?? (signal ? 130 : 1)));
