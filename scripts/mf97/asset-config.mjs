/** Node-only machine configuration. Scene URLs and source bytes remain unchanged. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { totalmem } from "node:os";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const GiB = 1024 ** 3;
const defaults = {
  repositoryData: "data",
  navigation: ".codex-work/cache/mf79-native-viewer-v1",
  maps: ".codex-work/cache/mf97-navigation/maps",
  mapJobs: ".codex-work/cache/mf97-navigation/jobs",
  groundReports: ".codex-work/cache/mf97-navigation/ground",
  continuation: ".codex-work/cache/mf97-navigation/continuation-20261002",
  studioBuild: ".codex-work/tmp/mf97-studio-build",
  previewBuild: ".codex-work/tmp/mf97-preview-build",
  tools: ".codex-work/tools/mf97",
};
export function loadAssetConfig(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? PROJECT_ROOT);
  const explicit =
    options.file ??
    (options.ignoreEnvironment ? undefined : process.env.MF_ASSET_CONFIG);
  const file = resolve(
    explicit ?? resolve(projectRoot, ".codex-work/config/assets.local.json"),
  );
  if (explicit && !existsSync(file))
    throw Error(`Asset configuration is missing: ${file}`);
  const raw = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { version: 1 };
  if (
    raw.version !== 1 ||
    !["local", "mac-studio", undefined].includes(raw.profile)
  )
    throw Error("Unsupported MF97 asset configuration/profile");
  const roots = {};
  for (const [key, value] of Object.entries({
    ...defaults,
    ...(raw.roots ?? {}),
  })) {
    if (!Object.hasOwn(defaults, key) && key !== "gaussian")
      throw Error(`Unknown asset root: ${key}`);
    if (typeof value !== "string" || !value.trim() || value.includes("\0"))
      throw Error(`Invalid asset root: ${key}`);
    roots[key] = resolve(projectRoot, value);
  }
  if (process.env.MF97_CACHE_ROOT && !options.ignoreEnvironment)
    roots.continuation = resolve(process.env.MF97_CACHE_ROOT);
  const mounts = (raw.mounts ?? []).map((mount) => {
    if (
      typeof mount.urlPrefix !== "string" ||
      !mount.urlPrefix.endsWith("/") ||
      !["/scene-assets/", "/repository-data/"].some((p) =>
        mount.urlPrefix.startsWith(p),
      ) ||
      typeof mount.path !== "string" ||
      !mount.path.trim()
    )
      throw Error("Invalid read-only asset mount");
    const prefix = decodeURIComponent(mount.urlPrefix);
    if (prefix.includes("\0") || prefix.split("/").includes(".."))
      throw Error("Unsafe asset mount");
    return { urlPrefix: prefix, path: resolve(projectRoot, mount.path) };
  });
  if (new Set(mounts.map((m) => m.urlPrefix)).size !== mounts.length)
    throw Error("Duplicate asset mount");
  const recordedRoots = raw.recordedRoots ?? {};
  for (const [key, value] of Object.entries(recordedRoots)) {
    if (
      (!Object.hasOwn(defaults, key) &&
        key !== "gaussian" &&
        key !== "projectRoot") ||
      typeof value !== "string" ||
      !isAbsolute(value)
    )
      throw Error("Invalid recorded source root");
  }
  for (const input of [
    roots.gaussian,
    roots.repositoryData,
    ...mounts.map((m) => m.path),
  ].filter(Boolean)) {
    if (overlaps(input, roots.continuation))
      throw Error("Continuation output overlaps a read-only scene root");
  }
  return {
    version: 1,
    file,
    configured: existsSync(file),
    projectRoot,
    profile: raw.profile ?? "local",
    roots,
    recordedRoots,
    mounts: mounts.sort((a, b) => b.urlPrefix.length - a.urlPrefix.length),
    python: raw.python ? resolve(projectRoot, raw.python) : undefined,
  };
}
/** Resolve historical evidence locations without changing the evidence bytes. */
export function resolveRecordedPath(file, config = loadAssetConfig()) {
  const absolute = resolve(file);
  const entries = Object.entries(config.recordedRoots).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [key, previous] of entries) {
    if (!contained(previous, absolute)) continue;
    const child = relative(previous, absolute);
    if (key === "gaussian" || key === "repositoryData")
      return resolveAssetUrl(
        (key === "gaussian" ? "/scene-assets/" : "/repository-data/") +
          child.split(sep).map(encodeURIComponent).join("/"),
        config,
      );
    return resolve(
      key === "projectRoot" ? config.projectRoot : config.roots[key],
      child,
    );
  }
  return absolute;
}
export function contained(root, file) {
  const part = relative(root, file);
  return (
    part === "" ||
    (part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part))
  );
}
/** Resolve existing symlink ancestors even when the intended output does not exist. */
export function physicalPath(file) {
  const absolute = resolve(file);
  let parent = absolute;
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) throw Error("No existing filesystem parent");
    parent = next;
  }
  return resolve(realpathSync(parent), relative(parent, absolute));
}
export function overlaps(a, b) {
  const left = physicalPath(a),
    right = physicalPath(b);
  return contained(left, right) || contained(right, left);
}
export function resolveAssetUrl(url, config = loadAssetConfig()) {
  const path = decodeURIComponent(url.split("?")[0]);
  if (path.includes("\0") || path.split("/").includes(".."))
    throw Error("Unsafe asset URL");
  const mounts = [...config.mounts];
  if (config.roots.gaussian)
    mounts.push({ urlPrefix: "/scene-assets/", path: config.roots.gaussian });
  mounts.push({
    urlPrefix: "/repository-data/",
    path: config.roots.repositoryData,
  });
  const mount = mounts.find((m) => path.startsWith(m.urlPrefix));
  if (!mount)
    throw Error(`Configure a read-only mount for ${path} in ${config.file}`);
  const file = resolve(mount.path, path.slice(mount.urlPrefix.length));
  if (!contained(mount.path, file))
    throw Error("Asset escaped its configured root");
  if (
    existsSync(file) &&
    !contained(realpathSync(mount.path), realpathSync(file))
  )
    throw Error("Asset symlink escaped its configured root");
  return file;
}
export function machineLimits(
  config = loadAssetConfig(),
  memoryBytes = totalmem(),
) {
  if (!Number.isFinite(memoryBytes) || memoryBytes <= 0)
    throw Error("Invalid physical memory measurement");
  const mac = config.profile === "mac-studio";
  const maxRssGiB = mac ? Math.min(64, memoryBytes / GiB / 2) : 1.5;
  return {
    reserveGiB: mac ? 20 : 5,
    maxAddedGiB: 8,
    maxRssGiB,
    heapGiB: mac ? Math.min(32, maxRssGiB / 2) : undefined,
    concurrency: 1,
  };
}
