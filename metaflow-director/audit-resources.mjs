import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { build } from "esbuild";
const origin = process.env.AUDIT_ORIGIN || "https://metaflow.shuang-su.com";
const output = path.resolve("../.codex-work/downloads/mf-106-evidence");
const dataRoot = path.resolve(process.env.METAFLOW_DATA_ROOT || "../data");
const built = await build({
  entryPoints: ["../metaflow-viewer/src/director-handoff.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
const response = await fetch(origin + "/data/index.json");
if (!response.ok) throw Error("Index unavailable");
const index = await response.json();
const eligible = index.resources.filter(
  (r) => r.category.includes("acg") && /\.(sog|ply)$/i.test(r.files.model),
);
const files = new Map();
const rows = [];
for (const r of eligible) {
  for (const route of [r.route, ...(r.aliases ?? [])])
    for (const suffix of ["/director", "/director/"])
      if (
        api.resolveDirectorResource(index.resources, route + suffix).id !== r.id
      )
        throw Error(route);
  for (const [role, ref] of Object.entries(r.files).filter(
    ([k, v]) =>
      ["model", "environment", "settings"].includes(k) && typeof v === "string",
  ))
    files.set(ref, { ref, role });
  const settings = JSON.parse(
    await readFile(path.join(dataRoot, r.files.settings), "utf8"),
  );
  const camera = settings.camera ?? settings.cameras?.[0]?.initial;
  if (!api.validDirectorPosition(camera))
    throw Error("Invalid initial camera: " + r.id);
  rows.push({
    id: r.id,
    route: r.route,
    aliases: r.aliases ?? [],
    environment: !!r.files.environment,
    settingsFormat: settings.camera ? "v1" : "v2",
  });
}
async function check(file) {
  const local = path.join(dataRoot, file.ref),
    hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(local)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  const url = origin + api.resourceDataUrl(file.ref),
    r = await fetch(url, {
      method: "HEAD",
      headers: { "accept-encoding": "identity" },
      signal: AbortSignal.timeout(30000),
    });
  const length = Number(r.headers.get("content-length"));
  const sha256 = hash.digest("hex");
  if (
    !r.ok ||
    (!r.headers.get("content-encoding") && length > 0 && length !== bytes)
  )
    throw Error(
      `Reference mismatch ${r.status} ${length}/${bytes}: ${file.ref}`,
    );
  let remoteHash = null;
  if (file.role === "settings") {
    const response = await fetch(url);
    remoteHash = createHash("sha256")
      .update(new Uint8Array(await response.arrayBuffer()))
      .digest("hex");
    if (remoteHash !== sha256)
      throw Error("Settings differ online: " + file.ref);
  }
  return {
    ...file,
    bytes,
    sha256,
    remoteHash,
    status: r.status,
    url,
    remoteContentLength: length || null,
  };
}
const queue = [...files.values()],
  checked = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      checked.push(await check(queue.shift()));
    }
  }),
);
const report = {
  at: new Date().toISOString(),
  origin,
  indexVersion: index.viewerVersion ?? index.release,
  eligible: rows.length,
  environments: rows.filter((r) => r.environment).length,
  settingsV1: rows.filter((r) => r.settingsFormat === "v1").length,
  settingsV2: rows.filter((r) => r.settingsFormat === "v2").length,
  excludedStreaming: index.resources.filter(
    (r) => r.category.includes("acg") && !eligible.includes(r),
  ).length,
  files: checked.sort((a, b) => a.ref.localeCompare(b.ref)),
  resources: rows,
};
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "resource-audit.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({ ...report, files: checked.length, resources: rows.length }),
);
