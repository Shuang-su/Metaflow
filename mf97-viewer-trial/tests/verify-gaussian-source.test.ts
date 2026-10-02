import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { utimesSync } from "node:fs";
import { resolve } from "node:path";
import { verifyGaussianJobSource } from "../src/verify-gaussian-source";

const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const temporaryRoot = resolve(
  import.meta.dirname,
  "../../.codex-work/tmp/mf97-source-proof-tests",
);
function job(inventory: { file: string; sha256: string }[], lod = 2) {
  return {
    lod,
    sourceInventory: inventory,
    gaussianHash: sha(JSON.stringify({ lod, inventory })),
  };
}
async function fixture() {
  await mkdir(temporaryRoot, { recursive: true });
  const base = await mkdtemp(resolve(temporaryRoot, "source-"));
  const root = resolve(base, "assets");
  await mkdir(resolve(root, "chunks"), { recursive: true });
  const files = {
    "lod-meta.json": '{"lodLevels":3}',
    "chunks/meta.json": '{"files":["color.webp"]}',
    "chunks/color.webp": "texture-v1",
  };
  const inventory = [];
  for (const [file, contents] of Object.entries(files)) {
    await writeFile(resolve(root, file), contents);
    inventory.push({ file, sha256: sha(contents) });
  }
  return {
    base,
    root,
    job: job(inventory),
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}

test("verifies every frozen file and exact ordered inventory hash without changing sources", async () => {
  const f = await fixture();
  try {
    const before = await stat(resolve(f.root, "chunks/color.webp"));
    assert.deepEqual(await verifyGaussianJobSource(f.job, f.root), {
      gaussianHash: f.job.gaussianHash,
      verifiedFileCount: 3,
    });
    assert.deepEqual(await verifyGaussianJobSource(f.job, f.root), {
      gaussianHash: f.job.gaussianHash,
      verifiedFileCount: 3,
    });
    const after = await stat(resolve(f.root, "chunks/color.webp"));
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(after.ctimeMs, before.ctimeMs);
    await assert.rejects(
      verifyGaussianJobSource({ ...f.job, lod: 1 }, f.root),
      /gaussianHash/,
    );
    await assert.rejects(
      verifyGaussianJobSource(
        { ...f.job, sourceInventory: [...f.job.sourceInventory].reverse() },
        f.root,
      ),
      /gaussianHash/,
    );
    await assert.rejects(
      verifyGaussianJobSource({ ...f.job, sourceInventory: [] }, f.root),
      /inventory/,
    );
  } finally {
    await f.cleanup();
  }
});

test("a changed texture invalidates a cached proof even with the original size and mtime", async () => {
  const f = await fixture();
  try {
    await verifyGaussianJobSource(f.job, f.root);
    const texture = resolve(f.root, "chunks/color.webp"),
      before = await stat(texture);
    await writeFile(texture, "texture-v2");
    await utimes(texture, before.atime, before.mtime);
    await assert.rejects(
      verifyGaussianJobSource(f.job, f.root),
      /SHA-256 mismatch/,
    );
    await writeFile(texture, "texture-v1");
    assert.equal(
      (await verifyGaussianJobSource(f.job, f.root)).verifiedFileCount,
      3,
    );
  } finally {
    await f.cleanup();
  }
});

test("rejects traversal, absolute paths, symlink escapes and duplicate inventory files", async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.base, "outside"), "outside");
    for (const file of [
      "../outside",
      resolve(f.base, "outside"),
      "chunks/../../outside",
    ]) {
      await assert.rejects(
        verifyGaussianJobSource(
          job([{ file, sha256: sha("outside") }]),
          f.root,
        ),
        /escaped/,
      );
    }
    await symlink(resolve(f.base, "outside"), resolve(f.root, "outside-link"));
    await assert.rejects(
      verifyGaussianJobSource(
        job([{ file: "outside-link", sha256: sha("outside") }]),
        f.root,
      ),
      /symlink escaped/,
    );
    await assert.rejects(
      verifyGaussianJobSource(
        job([
          f.job.sourceInventory[0],
          { ...f.job.sourceInventory[0], file: "./lod-meta.json" },
        ]),
        f.root,
      ),
      /Duplicate/,
    );
    await assert.rejects(
      verifyGaussianJobSource(
        job([{ file: "chunks", sha256: sha("") }]),
        f.root,
      ),
      /regular file/,
    );
  } finally {
    await f.cleanup();
  }
});

test("rejects sources changing during streamed verification instead of issuing a partial proof", async () => {
  const f = await fixture();
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const bytes = Buffer.alloc(4 * 1024 * 1024, 7),
      file = resolve(f.root, "stream.bin");
    await writeFile(file, bytes);
    const source = job([{ file: "stream.bin", sha256: sha(bytes) }]);
    let revision = Date.now();
    // Only timestamps change: all bytes still match, so failure demonstrates
    // the in-flight stability gate rather than a content hash mismatch.
    timer = setInterval(() => {
      const time = new Date(++revision);
      utimesSync(file, time, time);
    }, 0);
    await assert.rejects(
      verifyGaussianJobSource(source, f.root),
      /changed during verification/,
    );
    clearInterval(timer);
    timer = undefined;
    assert.equal(
      (await verifyGaussianJobSource(source, f.root)).verifiedFileCount,
      1,
    );
  } finally {
    if (timer) clearInterval(timer);
    await f.cleanup();
  }
});
