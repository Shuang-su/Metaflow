import { mkdir, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const lock = JSON.parse(
  await readFile(path.join(root, "upstream/source-lock.json")),
);
const cache = path.resolve(root, "../.codex-work/downloads/director-source");
await mkdir(cache, { recursive: true });
const archive = path.join(cache, "source.tar.gz");
if (!(await stat(archive).catch(() => null))) {
  const response = await fetch(
    `https://codeload.github.com/playcanvas/supersplat/tar.gz/${lock.commit}`,
  );
  if (!response.ok) throw Error(`Upstream download HTTP ${response.status}`);
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (hash(await readFile(archive)) !== lock.archiveSha256)
  throw Error("Source archive checksum mismatch");
const tree = path.join(cache, `supersplat-${lock.commit}`);
if (!(await stat(tree).catch(() => null)))
  execFileSync("tar", ["-xzf", archive, "-C", cache]);
for (const [file, expected] of Object.entries(lock.files)) {
  if (hash(await readFile(path.join(tree, file))) !== expected)
    throw Error(`Modified upstream: ${file}`);
}
await mkdir(path.join(root, "public/static/lib/webp"), { recursive: true });
await copyFile(
  path.join(root, "node_modules/@playcanvas/splat-transform/lib/webp.wasm"),
  path.join(root, "public/static/lib/webp/webp.wasm"),
);
console.log(
  `Verified SuperSplat ${lock.version} ${lock.commit}; public runtime contains the codec only.`,
);

// Distribute notices with the binary, and the exact unmodified MPL-covered source.
const notices = [
  "# Metaflow Director third-party notices",
  "Own application: Metaflow. Renderer derived from SuperSplat 3.4.2 (" +
    lock.commit +
    "), MIT.",
  "Mediabunny 1.55.2 is distributed under MPL-2.0. Its unmodified source is available alongside this file at licenses/mediabunny-1.55.2-source.tar.gz.",
  "No raw ui.camera styles, proprietary SVG assets or device models are distributed. Open Runde fonts are obtained independently from their OFL-licensed upstream.",
];
notices.push(
  "## SuperSplat\n\n" + (await readFile(path.join(tree, "LICENSE"), "utf8")),
);
notices.push(
  "## Open Runde\n\nUpstream: https://github.com/lauridskern/open-runde/tree/3e7ed7f3cdfa5523766db7e430066472615fc935\n\n" +
    (await readFile(
      path.join(root, "src/assets/open-runde/LICENSE.txt"),
      "utf8",
    )),
);
const packages = JSON.parse(
  await readFile(path.join(root, "package-lock.json"), "utf8"),
).packages;
for (const [dir, info] of Object.entries(packages)) {
  if (!dir || info.dev) continue;
  for (const file of [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "LICENSE-MIT",
    "COPYING",
    "COPYING.txt",
  ]) {
    const content = await readFile(path.join(root, dir, file), "utf8").catch(
      () => null,
    );
    if (content) {
      notices.push(
        "## " +
          dir.replace(/^node_modules\//, "") +
          " " +
          info.version +
          "\n\n" +
          content,
      );
      break;
    }
  }
}
notices.push(
  "## libwebp / WebP codec\n\n" +
    (await readFile(
      path.join(root, "upstream/licenses/libwebp-COPYING"),
      "utf8",
    )),
);
await mkdir(path.join(root, "public/licenses"), { recursive: true });
execFileSync("tar", [
  "-czf",
  path.join(root, "public/licenses/mediabunny-1.55.2-source.tar.gz"),
  "-C",
  path.join(root, "node_modules/mediabunny"),
  "src",
  "LICENSE",
  "package.json",
  "README.md",
]);
await writeFile(
  path.join(root, "public/THIRD_PARTY_NOTICES.txt"),
  notices.join("\n\n") + "\n",
);
