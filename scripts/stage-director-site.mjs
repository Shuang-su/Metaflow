#!/usr/bin/env node
/** Assemble locked release data, registered Editor files, and the built Director. */
import {
  cp,
  mkdir,
  copyFile,
  readFile,
  rm,
  writeFile,
  open,
  access,
  mkdtemp,
  rename,
} from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publish = path.join(root, "metaflow-viewer/public");
const registered = execFileSync(
  "git",
  ["ls-files", "-z", "metaflow-editor"],
  { cwd: root },
)
  .toString()
  .split("\0")
  .filter(Boolean);
if (!registered.length)
  throw Error("Missing registered editor assets");
await mkdir(publish, { recursive: true });
const staging = await mkdtemp(path.join(publish, ".stage-"));
const stagedData = path.join(staging, "data");
const dataLock = path.join(root, "metadata/data-releases/active.lock.json");
const sources = [path.join(root, "data")];
if (process.env.METAFLOW_DATA_SOURCE) sources.unshift(process.env.METAFLOW_DATA_SOURCE);
try {
  execFileSync("python3", [
    path.join(root, "scripts/materialize-data.py"), "--all", "--lock", dataLock,
    "--output", stagedData, ...sources.flatMap((dir) => ["--source", dir]),
  ], { stdio: "inherit" });
  // The release lock owns every published data byte. The checkout may also
  // contain authoring metadata belonging to a different editor release.
  const sourceIndex = await readFile(path.join(root, "data/index.json"));
  if (!sourceIndex.equals(await readFile(path.join(stagedData, "index.json")))) {
    throw Error("Selected data lock differs from the branch index; update both before publishing");
  }
  for (const file of registered) {
    const dest = path.join(staging, file.replace(/^metaflow-editor\//, "editor/"));
    const source = path.join(root, file);
    const fd = await open(source, "r");
    const head = Buffer.alloc(130);
    try { await fd.read(head, 0, 130, 0); } finally { await fd.close(); }
    if (head.toString().startsWith("version https://git-lfs.github.com/spec/v1"))
      throw Error(`Unmaterialized LFS resource: ${file}`);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(source, dest, constants.COPYFILE_FICLONE);
  }
  const index = JSON.parse(await readFile(path.join(stagedData, "index.json")));
  // Every primary model, declared companion and legacy LOD must be staged.
  const paths = new Set(index.resources.flatMap(({files}) => [
    ...Object.values(files).filter((value) => typeof value === "string"),
    ...(files.lod ?? []).map(({file}) => file)
  ]));
  for (const file of paths) {
    const target = path.resolve(stagedData, file);
    if (!target.startsWith(stagedData + path.sep)) throw Error(`Invalid data path: ${file}`);
    await access(target);
  }
  await cp(
    path.join(root, ".codex-work/tmp/director-dist"),
    path.join(staging, "director"),
    { recursive: true },
  );
  const version = JSON.parse(
    await readFile(path.join(root, "metadata/version-history.json"), "utf8"),
  ).current;
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  await writeFile(
    path.join(staging, "build.json"),
    JSON.stringify(
      {
        commit: source,
        version: version.appSemver,
        productCommit: version.gitRef,
        builtAt: new Date().toISOString(),
        director: {
          engine: "2.22.4",
          supersplat: "3.4.2",
          splatTransform: "3.6.4",
        },
      },
      null,
      2,
    ) + "\n",
  );
  const replaced = [];
  try {
    for (const name of ["data", "editor", "director", "build.json"]) {
      const dest = path.join(publish, name);
      const backup = path.join(staging, "previous-" + name);
      let hadPrevious = true;
      await rename(dest, backup).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        hadPrevious = false;
      });
      replaced.push({ dest, backup, hadPrevious });
      await rename(path.join(staging, name), dest);
    }
  } catch (error) {
    for (const { dest, backup, hadPrevious } of replaced.reverse()) {
      await rm(dest, { recursive: true, force: true });
      if (hadPrevious) await rename(backup, dest);
    }
    throw error;
  }
  console.log(`Staged locked data with ${registered.length} Editor files and Director; ${version.appSemver} ${source}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
