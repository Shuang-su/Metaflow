#!/usr/bin/env node
/** Publish only registered resources/editor files, and the freshly built Director. */
import {
  cp,
  mkdir,
  copyFile,
  readFile,
  rm,
  writeFile,
  open,
  link,
} from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publish = path.join(root, "metaflow-viewer/public");
const registered = execFileSync(
  "git",
  ["ls-files", "-z", "data", "metaflow-editor"],
  { cwd: root },
)
  .toString()
  .split("\0")
  .filter(Boolean);
if (!registered.length) throw Error("Missing registered publish assets");
// Remove only generated directories owned by this build. Models remain untouched.
for (const name of ["data", "editor", "director"])
  await rm(path.join(publish, name), { recursive: true, force: true });
for (const file of registered) {
  const dest = path.join(
    publish,
    file.startsWith("data/")
      ? file
      : file.replace(/^metaflow-editor\//, "editor/"),
  );
  const source = path.join(root, file);
  const fd = await open(source, "r");
  const head = Buffer.alloc(130);
  await fd.read(head, 0, 130, 0);
  await fd.close();
  if (head.toString().startsWith("version https://git-lfs.github.com/spec/v1"))
    throw Error(`Unmaterialized LFS resource: ${file}`);
  await mkdir(path.dirname(dest), { recursive: true });
  // Staging is read-only: hard-link model bytes on this volume, copy small metadata.
  // The build only unlinks these generated destinations, never writes into them.
  if (/\.(sog|ply|webp|bin|jpg|png)$/i.test(file))
    await link(source, dest).catch(() =>
      copyFile(source, dest, constants.COPYFILE_FICLONE),
    );
  else await copyFile(source, dest);
}
await cp(
  path.join(root, ".codex-work/tmp/director-dist"),
  path.join(publish, "director"),
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
  path.join(publish, "build.json"),
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
console.log(
  `Staged ${registered.length} existing data/editor files plus Director; ${version.appSemver} ${source}`,
);
