/** Configure scene mounts; never copy or change their source files. */
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { loadAssetConfig, PROJECT_ROOT } from "./asset-config.mjs";

const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1] || args[i + 1].startsWith("--"))
    throw Error(`Missing ${name}`);
  return args[i + 1];
};
const file = resolve(
  value("--config") ??
    process.env.MF_ASSET_CONFIG ??
    resolve(PROJECT_ROOT, ".codex-work/config/assets.local.json"),
);
const before = existsSync(file) ? readFileSync(file, "utf8") : undefined;
const next = before
  ? JSON.parse(before)
  : JSON.parse(
      readFileSync(new URL("./assets.example.json", import.meta.url), "utf8"),
    );
next.profile = value("--profile") ?? next.profile;
next.mounts ??= [];
const scenes = JSON.parse(
  readFileSync(
    resolve(PROJECT_ROOT, "mf79-viewer-trial/scene-exhibitions.json"),
    "utf8",
  ),
).scenes;
for (const [flag, id] of [
  ["--apms", "apms-2026"],
  ["--sdi", "sdi-2026"],
  ["--dayun", "dayun"],
]) {
  const requested = value(flag);
  if (!requested) continue;
  const path = resolve(requested);
  if (!statSync(path).isDirectory())
    throw Error(`Scene folder is not a directory: ${path}`);
  const prefix =
    id === "dayun"
      ? "/repository-data/Shenzhen/250917 Dayun/"
      : scenes
          .find((s) => s.id === id)
          .assetUrl.replace(/streamed\/lod-meta\.json$/, "");
  next.mounts = next.mounts.filter(
    (m) => decodeURIComponent(m.urlPrefix) !== decodeURIComponent(prefix),
  );
  next.mounts.push({ urlPrefix: prefix, path });
}
if (value("--python")) next.python = resolve(value("--python"));
mkdirSync(dirname(file), { recursive: true });
const pending = file + ".next";
writeFileSync(pending, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
try {
  loadAssetConfig({ file: pending, projectRoot: PROJECT_ROOT });
  if (before !== (existsSync(file) ? readFileSync(file, "utf8") : undefined))
    throw Error(
      "Asset configuration changed while editing; preserve the proposal",
    );
  renameSync(pending, file);
} catch (error) {
  throw Error(
    `Configuration not applied; inspect ${pending}: ${error.message}`,
  );
}
console.log(
  JSON.stringify(
    {
      configFile: file,
      profile: next.profile,
      mounts: next.mounts,
      sourceFilesModified: false,
    },
    null,
    2,
  ),
);
