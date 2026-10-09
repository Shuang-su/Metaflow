import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadAssetConfig } from "../../scripts/mf97/asset-config.mjs";
import {
  inventoryTransfer,
  exportTransfer,
  importTransfer,
  validateTransfer,
} from "../src/cache-transfer";
import { GiB } from "../src/offline-resources";
const budget = { measureFreeBytes: () => 100 * GiB, measureRssBytes: () => 0 };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mf97-transfer-"));
  const config = loadAssetConfig({
    projectRoot: root,
    ignoreEnvironment: true,
  });
  // Only Git metadata is shared; sources and destination are small independent fixtures.
  config.projectRoot = new URL("../..", import.meta.url).pathname;
  mkdirSync(config.roots.maps, { recursive: true });
  mkdirSync(join(config.roots.continuation, "validation"), { recursive: true });
  writeFileSync(join(config.roots.maps, "manifest.json"), '{"fixture":1}');
  writeFileSync(
    join(config.roots.continuation, "validation/proof.json"),
    '{"fixture":1}',
  );
  writeFileSync(
    join(config.roots.continuation, "validation/screenshot.png"),
    "excluded",
  );
  return { root, config };
}
test("cache packs deduplicate bytes, preserve historical evidence and resume without replacing files", async () => {
  const { root, config } = fixture(),
    manifest = await inventoryTransfer(config);
  assert.equal(manifest.entries.length, 2);
  assert.equal(manifest.uniqueBytes * 2, manifest.bytes);
  assert.ok(manifest.historicalEvidenceOnly);
  const pack = join(root, "pack"),
    destination = join(root, "received");
  await exportTransfer(manifest, pack, config, budget);
  await exportTransfer(manifest, pack, config, budget);
  const result = await importTransfer(pack, destination, config, budget);
  assert.equal(result.runtimeRevalidation, "pending");
  await importTransfer(pack, destination, config, budget);
  assert.equal(
    readFileSync(join(destination, "maps/manifest.json"), "utf8"),
    '{"fixture":1}',
  );
  assert.ok(
    !existsSync(join(destination, "continuation/validation/screenshot.png")),
  );
  const imported = loadAssetConfig({
    file: result.configFile,
    projectRoot: root,
  });
  assert.equal(imported.roots.maps, realpathSync(join(destination, "maps")));
});
test("corrupt transfer objects fail before any destination cache is created", async () => {
  const { root, config } = fixture(),
    manifest = await inventoryTransfer(config),
    pack = join(root, "pack");
  await exportTransfer(manifest, pack, config, budget);
  writeFileSync(join(pack, "objects", manifest.entries[0].sha256), "corrupted");
  const destination = join(root, "received");
  await assert.rejects(
    importTransfer(pack, destination, config, budget),
    /corrupt/,
  );
  assert.ok(!existsSync(destination));
});
test("group selection leaves unused caches out of a pack instead of downloading scenes", async () => {
  const { config } = fixture(),
    manifest = await inventoryTransfer(config, ["maps"]);
  assert.equal(manifest.entries.length, 1);
  assert.ok(manifest.entries.every((entry) => entry.root === "maps"));
  assert.ok(manifest.omittedRoots.includes("continuation"));
  await assert.rejects(inventoryTransfer(config, ["maps", "maps"]), /once/);
});
test("self-consistent but unsafe entry paths are rejected, and source overlap cannot export", async () => {
  const { root, config } = fixture(),
    manifest = await inventoryTransfer(config);
  const unsafe = structuredClone(manifest);
  unsafe.entries[0].file = "../scene.bin";
  unsafe.id = createHash("sha256")
    .update(
      JSON.stringify({
        version: unsafe.version,
        codeCommit: unsafe.codeCommit,
        entries: unsafe.entries,
        recordedRoots: unsafe.recordedRoots,
        omittedRoots: unsafe.omittedRoots,
        historicalEvidenceOnly: unsafe.historicalEvidenceOnly,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  assert.throws(() => validateTransfer(unsafe), /Invalid/);
  await assert.rejects(
    exportTransfer(manifest, join(config.roots.maps, "pack"), config, budget),
    /overlaps/,
  );
  assert.ok(!existsSync(join(config.roots.maps, "pack")));
});
