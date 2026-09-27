#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const index = JSON.parse(
  await readFile(new URL("../../../data/index.json", import.meta.url), "utf8"),
);
const rows = index.resources.map((r) => [r.id, r.route, r.title]);
if (new Set(rows.map((r) => r[1].replace(/\/$/, ""))).size !== rows.length)
  throw Error("Duplicate public routes");
for (const [id, route, title] of rows)
  if (
    typeof id !== "string" ||
    !id ||
    id.length > 200 ||
    typeof route !== "string" ||
    !route.startsWith("/") ||
    route.length > 500 ||
    typeof title !== "string" ||
    !title ||
    title.length > 300
  )
    throw Error("Invalid public catalog");
const out = resolve(process.argv[2] ?? ".codex-work/dashboard-catalog");
await mkdir(out, { recursive: true });
await writeFile(
  resolve(out, "public-resources.json"),
  JSON.stringify(
    Object.fromEntries(rows.map(([, route, title]) => [route, title])),
    null,
    2,
  ) + "\n",
);
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
await writeFile(
  resolve(out, "public-resources.sql"),
  `-- Generated only from the reviewed public catalog. Run as migration administrator.\nbegin;\ndelete from dashboard_private.public_resources;\ninsert into dashboard_private.public_resources (resource_id,route,title) values\n${rows.map((r) => "(" + r.map(quote).join(",") + ")").join(",\n")};\ncommit;\n`,
);
console.log(`Exported ${rows.length} public resource labels to ${out}`);
