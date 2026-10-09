import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  inventoryTransfer,
  exportTransfer,
  importTransfer,
  validateTransfer,
} from "../src/cache-transfer";
import { loadAssetConfig } from "../../scripts/mf97/asset-config.mjs";
const args = process.argv.slice(2),
  command = args[0];
const value = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--"))
    throw Error(`Provide ${name}`);
  return args[index + 1];
};
const inventory = () =>
  inventoryTransfer(
    loadAssetConfig(),
    args.includes("--groups")
      ? (value("--groups").split(",") as Parameters<
          typeof inventoryTransfer
        >[1])
      : undefined,
  );
if (command === "inventory") {
  const manifest = await inventory();
  if (args.includes("--output"))
    writeFileSync(
      resolve(value("--output")),
      JSON.stringify(manifest, null, 2),
      { flag: "wx" },
    );
  console.log(
    JSON.stringify({
      id: manifest.id,
      files: manifest.entries.length,
      bytes: manifest.bytes,
      uniqueBytes: manifest.uniqueBytes,
      omittedRoots: manifest.omittedRoots,
      historicalEvidenceOnly: true,
    }),
  );
} else if (command === "export") {
  const manifest = args.includes("--manifest")
    ? validateTransfer(JSON.parse(readFileSync(value("--manifest"), "utf8")))
    : await inventory();
  console.log(
    JSON.stringify(await exportTransfer(manifest, value("--output"))),
  );
} else if (command === "import") {
  console.log(
    JSON.stringify(await importTransfer(value("--pack"), value("--output"))),
  );
} else
  throw Error(
    "Usage: cache-transfer.ts inventory [--output file] | export --output directory [--manifest file] | import --pack directory --output new-cache-directory",
  );
