/** Content-checked transfer of derived caches only; never scene models or tool environments. */
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  loadAssetConfig,
  overlaps,
  resolveRecordedPath,
  type AssetConfig,
} from "../../scripts/mf97/asset-config.mjs";
import {
  createOfflineResources,
  offlineResourceOptions,
  GiB,
  type OfflineResourceOptions,
} from "./offline-resources";
import { hashFile } from "../scripts/gaussian-map-offline";

const kinds = [
  "navigation",
  "maps",
  "mapJobs",
  "groundReports",
  "continuation",
] as const;
type Kind = (typeof kinds)[number];
export type TransferEntry = {
  root: Kind;
  file: string;
  bytes: number;
  sha256: string;
};
export type TransferManifest = {
  version: 1;
  id: string;
  codeCommit: string;
  entries: TransferEntry[];
  recordedRoots: Record<string, string>;
  omittedRoots: string[];
  bytes: number;
  uniqueBytes: number;
  historicalEvidenceOnly: true;
};
const sha = (input: string) => createHash("sha256").update(input).digest("hex");
const permitted = (kind: Kind, file: string) => {
  if (
    file
      .split("/")
      .some((p) => p.startsWith(".") || p === "node_modules" || p === "tools")
  )
    return false;
  if (!/\.(json|bin|webp|gz)$/.test(file)) return false;
  if (kind === "continuation") {
    if (
      !/^(accepted|navigation|trial-bundles|ground-v2|review-decisions|validation|dayun)\//.test(
        file,
      )
    )
      return false;
    if (file.startsWith("validation/")) return file.endsWith(".json");
  }
  return true;
};
function entries(root: string, prefix = ""): string[] {
  return readdirSync(resolve(root, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      if (
        entry.name.startsWith(".") ||
        entry.name === "tools" ||
        entry.name === "node_modules"
      )
        return [];
      const file = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink())
        throw Error(`Source cache symlink must be reviewed: ${file}`);
      if (entry.isDirectory()) return entries(root, file);
      if (!entry.isFile()) throw Error("Unsupported cache file");
      return [file];
    },
  );
}
function identity(manifest: Omit<TransferManifest, "id"> | TransferManifest) {
  return sha(
    JSON.stringify({
      version: manifest.version,
      codeCommit: manifest.codeCommit,
      entries: manifest.entries,
      recordedRoots: manifest.recordedRoots,
      omittedRoots: manifest.omittedRoots,
      historicalEvidenceOnly: manifest.historicalEvidenceOnly,
    }),
  ).slice(0, 24);
}
export function validateTransfer(manifest: TransferManifest) {
  if (
    manifest.version !== 1 ||
    !/^[a-f0-9]{24}$/.test(manifest.id) ||
    identity(manifest) !== manifest.id ||
    manifest.historicalEvidenceOnly !== true
  )
    throw Error("Transfer manifest identity differs");
  const rootNames = [
    "projectRoot",
    "repositoryData",
    "gaussian",
    "navigation",
    "maps",
    "mapJobs",
    "groundReports",
    "continuation",
    "studioBuild",
    "previewBuild",
    "tools",
  ];
  if (
    !manifest.recordedRoots ||
    Object.entries(manifest.recordedRoots).some(
      ([key, value]) =>
        !rootNames.includes(key) ||
        typeof value !== "string" ||
        !isAbsolute(value) ||
        value.includes("\0"),
    ) ||
    !Array.isArray(manifest.omittedRoots) ||
    manifest.omittedRoots.some((key) => !kinds.includes(key as Kind))
  )
    throw Error("Invalid recorded roots");
  const keys = new Set<string>(),
    hashes = new Map<string, number>();
  for (const entry of manifest.entries) {
    const key = entry.root + ":" + entry.file;
    if (
      !kinds.includes(entry.root) ||
      entry.file.startsWith("/") ||
      entry.file.split("/").some((p) => !p || p === "..") ||
      !permitted(entry.root, entry.file) ||
      keys.has(key) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0
    )
      throw Error("Invalid cache transfer entry");
    if (hashes.has(entry.sha256) && hashes.get(entry.sha256) !== entry.bytes)
      throw Error("Conflicting object length");
    keys.add(key);
    hashes.set(entry.sha256, entry.bytes);
  }
  if (
    manifest.bytes !== manifest.entries.reduce((n, e) => n + e.bytes, 0) ||
    manifest.uniqueBytes !== [...hashes.values()].reduce((a, b) => a + b, 0)
  )
    throw Error("Transfer size summary differs");
  return manifest;
}
export async function inventoryTransfer(
  config: AssetConfig = loadAssetConfig(),
  selected: readonly Kind[] = kinds,
): Promise<TransferManifest> {
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((kind) => !kinds.includes(kind))
  )
    throw Error("Select known cache groups once each");
  const rows: TransferEntry[] = [],
    omittedRoots: string[] = [],
    hashes = new Map<string, number>();
  for (const kind of kinds) {
    if (!selected.includes(kind)) {
      omittedRoots.push(kind);
      continue;
    }
    const root = config.roots[kind];
    if (!existsSync(root)) {
      omittedRoots.push(kind);
      continue;
    }
    for (const file of entries(root).sort()) {
      if (!permitted(kind, file)) continue;
      const path = resolve(root, file),
        bytes = lstatSync(path).size,
        hash = await hashFile(path);
      rows.push({ root: kind, file, bytes, sha256: hash });
      hashes.set(hash, bytes);
    }
  }
  const raw = {
    version: 1 as const,
    codeCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: config.projectRoot,
      encoding: "utf8",
    }).trim(),
    entries: rows,
    recordedRoots: { projectRoot: config.projectRoot, ...config.roots },
    omittedRoots,
    bytes: rows.reduce((n, e) => n + e.bytes, 0),
    uniqueBytes: [...hashes.values()].reduce((a, b) => a + b, 0),
    historicalEvidenceOnly: true as const,
  };
  return validateTransfer({ ...raw, id: identity(raw) });
}
export async function exportTransfer(
  manifest: TransferManifest,
  output: string,
  config: AssetConfig = loadAssetConfig(),
  resourceOptions: OfflineResourceOptions = {},
) {
  validateTransfer(manifest);
  const root = resolve(output);
  const protectedInputs = [
    config.roots.gaussian,
    config.roots.repositoryData,
    ...config.mounts.map((m) => m.path),
    ...kinds.map((k) => config.roots[k]),
  ].filter((p): p is string => !!p);
  if (protectedInputs.some((source) => overlaps(source, root)))
    throw Error("Transfer output overlaps source caches or scene inputs");
  const resources = createOfflineResources({
    ...offlineResourceOptions(),
    ...resourceOptions,
    root,
    taskOutputBytes: 8 * GiB,
  });
  const copies = new Set<string>();
  resources.assertCapacity(
    manifest.uniqueBytes + 2 * 1024 ** 2,
    "cache transfer pack",
  );
  for (const entry of manifest.entries) {
    if (copies.has(entry.sha256)) continue;
    const file = resolve(config.roots[entry.root], entry.file);
    const stat = lstatSync(file);
    if (
      !stat.isFile() ||
      stat.size !== entry.bytes ||
      (await hashFile(file)) !== entry.sha256
    )
      throw Error("Source cache changed after inventory");
    const bytes = readFileSync(file);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      throw Error("Source cache changed before copying");
    resources.writeFileAtomic(`objects/${entry.sha256}`, bytes, {
      replace: false,
    });
    copies.add(entry.sha256);
  }
  resources.writeJsonAtomic("manifest.json", manifest, { replace: false });
  return {
    id: manifest.id,
    objects: copies.size,
    bytes: manifest.uniqueBytes,
    output: resources.root,
  };
}
export async function importTransfer(
  pack: string,
  output: string,
  config: AssetConfig = loadAssetConfig(),
  resourceOptions: OfflineResourceOptions = {},
) {
  const manifest = validateTransfer(
    JSON.parse(readFileSync(resolve(pack, "manifest.json"), "utf8")),
  );
  const resources = createOfflineResources({
    ...offlineResourceOptions(),
    ...resourceOptions,
    root: output,
    taskOutputBytes: 8 * GiB,
  });
  for (const input of [
    config.roots.gaussian,
    config.roots.repositoryData,
    ...config.mounts.map((m) => m.path),
    pack,
  ].filter((p): p is string => !!p)) {
    if (overlaps(input, resources.root))
      throw Error("Import output overlaps scene inputs or transfer pack");
  }
  // Preflight every object before writing any destination cache file.
  const verified = new Set<string>();
  for (const entry of manifest.entries) {
    if (verified.has(entry.sha256)) continue;
    const file = resolve(pack, "objects", entry.sha256),
      stat = lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== entry.bytes ||
      (await hashFile(file)) !== entry.sha256
    )
      throw Error(`Missing/corrupt transfer object: ${entry.sha256}`);
    verified.add(entry.sha256);
  }
  resources.assertCapacity(manifest.bytes + 2 * 1024 ** 2, "cache import");
  for (const entry of manifest.entries) {
    const bytes = readFileSync(resolve(pack, "objects", entry.sha256));
    if (
      bytes.length !== entry.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== entry.sha256
    )
      throw Error("Transfer object changed after preflight");
    resources.writeFileAtomic(`${entry.root}/${entry.file}`, bytes, {
      replace: false,
    });
  }
  const roots = { ...config.roots };
  for (const kind of kinds)
    if (!manifest.omittedRoots.includes(kind))
      roots[kind] = resolve(resources.root, kind);
  const nextConfig = {
    version: 1,
    profile: config.profile,
    roots,
    mounts: config.mounts,
    python: config.python,
    recordedRoots: manifest.recordedRoots,
  };
  // Explicit output configuration; the user's current configuration is never overwritten.
  resources.writeJsonAtomic("assets.imported.local.json", nextConfig, {
    replace: false,
  });
  const located = { ...config, roots, recordedRoots: manifest.recordedRoots };
  const trialBundles = manifest.entries
    .filter(
      (entry) =>
        entry.root === "continuation" &&
        /^trial-bundles\/[^/]+\/bundle\.json$/.test(entry.file),
    )
    .map((entry) => {
      const bundle = JSON.parse(
        readFileSync(resolve(resources.root, entry.root, entry.file), "utf8"),
      );
      const inputs = bundle.identity?.inputs ?? {};
      return {
        originalId: bundle.id ?? entry.file.split("/")[1],
        originalBundleHash: entry.sha256,
        inputLocations: Object.fromEntries(
          Object.entries(inputs)
            .filter(
              ([, value]) => typeof value === "string" && isAbsolute(value),
            )
            .map(([key, value]) => [
              key,
              resolveRecordedPath(value as string, located),
            ]),
        ),
        state: "needs-new-proofs-and-bundle-identity",
        sourceBundleUnmodified: true,
      };
    });
  resources.writeJsonAtomic(
    "trial-relocation.json",
    {
      version: 1,
      transferId: manifest.id,
      trialBundles,
      runtimeRevalidation: "pending",
    },
    { replace: false },
  );
  resources.writeJsonAtomic(
    "transfer-receipt.json",
    {
      version: 1,
      id: manifest.id,
      codeCommit: manifest.codeCommit,
      files: manifest.entries.length,
      byteHashesVerified: true,
      historicalEvidenceOnly: true,
      runtimeRevalidation: "pending",
    },
    { replace: false },
  );
  return {
    id: manifest.id,
    configFile: resolve(resources.root, "assets.imported.local.json"),
    files: manifest.entries.length,
    runtimeRevalidation: "pending",
  };
}
