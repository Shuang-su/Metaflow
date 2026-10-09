import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadAssetConfig,
  resolveAssetUrl,
  resolveRecordedPath,
  machineLimits,
  GiB,
} from "../../scripts/mf97/asset-config.mjs";

test("scene-specific mounts work independently of repository checkout and preserve encoded scene paths", () => {
  const root = mkdtempSync(join(tmpdir(), "mf97-paths-"));
  const file = join(root, "assets.json");
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      roots: { gaussian: "other" },
      mounts: [{ urlPrefix: "/scene-assets/展览/", path: "existing/model" }],
    }),
  );
  const config = loadAssetConfig({
    file,
    projectRoot: root,
    ignoreEnvironment: true,
  });
  assert.equal(
    resolveAssetUrl("/scene-assets/%E5%B1%95%E8%A7%88/lod-meta.json", config),
    join(root, "existing/model/lod-meta.json"),
  );
  assert.equal(
    resolveAssetUrl("/scene-assets/other.sog", config),
    join(root, "other/other.sog"),
  );
  assert.throws(
    () => resolveAssetUrl("/scene-assets/%2e%2e/private", config),
    /Unsafe/,
  );
  const external = join(root, "outside");
  mkdirSync(external);
  mkdirSync(join(root, "existing/model"), { recursive: true });
  writeFileSync(join(external, "secret"), "fixture");
  symlinkSync(join(external, "secret"), join(root, "existing/model/secret"));
  assert.throws(
    () => resolveAssetUrl("/scene-assets/展览/secret", config),
    /symlink/,
  );
});
test("historical source paths relocate through mounts while overlap through an existing symlink is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "mf97-recorded-"));
  mkdirSync(join(root, "existing/derived"), { recursive: true });
  const file = join(root, "config.json");
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      recordedRoots: { gaussian: "/old/scenes", projectRoot: "/old/code" },
      mounts: [
        { urlPrefix: "/scene-assets/exhibition/", path: "existing/derived" },
      ],
    }),
  );
  const config = loadAssetConfig({
    file,
    projectRoot: root,
    ignoreEnvironment: true,
  });
  assert.equal(
    resolveRecordedPath("/old/scenes/exhibition/voxel/walk.voxel.json", config),
    join(root, "existing/derived/voxel/walk.voxel.json"),
  );
  assert.equal(
    resolveRecordedPath("/old/code/scripts/tool.ts", config),
    join(root, "scripts/tool.ts"),
  );
  symlinkSync(join(root, "existing/derived"), join(root, "alias"));
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      roots: { continuation: "alias/output" },
      mounts: [
        { urlPrefix: "/scene-assets/exhibition/", path: "existing/derived" },
      ],
    }),
  );
  assert.throws(
    () => loadAssetConfig({ file, projectRoot: root, ignoreEnvironment: true }),
    /overlaps/,
  );
});
test("missing scene mount is an explicit configuration error and machine profiles respect actual RAM", () => {
  const root = mkdtempSync(join(tmpdir(), "mf97-profile-"));
  const config = loadAssetConfig({
    projectRoot: root,
    ignoreEnvironment: true,
  });
  assert.throws(
    () => resolveAssetUrl("/scene-assets/model.json", config),
    /Configure/,
  );
  assert.equal(machineLimits(config, 512 * GiB).maxRssGiB, 1.5);
  const mac = { ...config, profile: "mac-studio" as const };
  assert.equal(machineLimits(mac, 512 * GiB).maxRssGiB, 64);
  assert.equal(machineLimits(mac, 32 * GiB).maxRssGiB, 16);
  assert.equal(machineLimits(mac, 32 * GiB).heapGiB, 8);
  assert.equal(machineLimits(mac, 512 * GiB).reserveGiB, 20);
});
