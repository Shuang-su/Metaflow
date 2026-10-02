import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { BigIntStats } from "node:fs";

type SourceInventoryEntry = { file: string; sha256: string };
export type GaussianSourceJob = {
  lod: number;
  gaussianHash: string;
  sourceInventory?: unknown;
};
export type GaussianSourceProof = {
  gaussianHash: string;
  verifiedFileCount: number;
};

const cache = new Map<string, { identity: string; sha256: string }>();
const CACHE_ENTRIES = 256;
let pending: Promise<unknown> = Promise.resolve();
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const identity = (value: BigIntStats) =>
  [
    value.dev,
    value.ino,
    value.mode,
    value.size,
    value.mtimeNs,
    value.ctimeNs,
  ].join(":");
const contained = (root: string, file: string) => {
  const part = relative(root, file);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};

/** Read-only proof against the exact ordered inventory written by
 * prepare-gaussian-map-job.ts. assetRoot is the directory containing the
 * Gaussian manifest; inventory paths are relative to that directory.
 * Calls and file reads are serialized. The bounded cache stores only digests,
 * and even cache hits have their filesystem identity checked again at the end.
 */
export function verifyGaussianJobSource(
  job: GaussianSourceJob,
  assetRoot: string,
): Promise<GaussianSourceProof> {
  let inventory: SourceInventoryEntry[];
  let gaussianHash: string;
  try {
    if (
      !Number.isInteger(job.lod) ||
      job.lod < 0 ||
      !/^[a-f0-9]{64}$/.test(job.gaussianHash) ||
      !Array.isArray(job.sourceInventory) ||
      !job.sourceInventory.length
    )
      throw Error("Invalid frozen Gaussian source inventory");
    inventory = job.sourceInventory.map((entry: unknown) => {
      const item = entry as SourceInventoryEntry | null;
      if (
        !item ||
        typeof item.file !== "string" ||
        !item.file ||
        item.file.includes("\0") ||
        item.file.includes("\\") ||
        isAbsolute(item.file) ||
        item.file.split("/").includes("..") ||
        typeof item.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(item.sha256)
      )
        throw Error("Invalid or escaped Gaussian inventory path/hash");
      return { file: item.file, sha256: item.sha256 };
    });
    gaussianHash = sha(JSON.stringify({ lod: job.lod, inventory }));
    if (gaussianHash !== job.gaussianHash)
      throw Error("Frozen Gaussian inventory does not match gaussianHash");
  } catch (error) {
    return Promise.reject(error);
  }
  const result = pending.then(async () => {
    const root = await realpath(assetRoot);
    const paths = new Set<string>();
    const snapshots: {
      file: string;
      canonical: string;
      identity: string;
      sha256: string;
    }[] = [];
    for (const item of inventory) {
      const file = resolve(root, item.file);
      if (!contained(root, file))
        throw Error("Gaussian inventory path escaped asset root");
      const canonical = await realpath(file);
      if (!contained(root, canonical))
        throw Error("Gaussian source symlink escaped asset root");
      if (paths.has(canonical))
        throw Error("Duplicate Gaussian source inventory file");
      paths.add(canonical);
      const metadata = await stat(canonical, { bigint: true });
      if (!metadata.isFile())
        throw Error("Gaussian source must be a regular file");
      snapshots.push({
        file,
        canonical,
        identity: identity(metadata),
        sha256: item.sha256,
      });
    }
    const unchanged = async (item: (typeof snapshots)[number]) => {
      if (
        (await realpath(item.file)) !== item.canonical ||
        identity(await stat(item.canonical, { bigint: true })) !== item.identity
      )
        throw Error(
          `Gaussian source changed during verification: ${item.file}`,
        );
    };
    for (const item of snapshots) {
      await unchanged(item);
      let digest = cache.get(item.canonical);
      if (digest?.identity !== item.identity) {
        cache.delete(item.canonical);
        const handle = await open(
          item.canonical,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          if (identity(await handle.stat({ bigint: true })) !== item.identity)
            throw Error(
              `Gaussian source changed during verification: ${item.file}`,
            );
          const hash = createHash("sha256");
          for await (const chunk of handle.createReadStream({
            autoClose: false,
          }))
            hash.update(chunk);
          if (identity(await handle.stat({ bigint: true })) !== item.identity)
            throw Error(
              `Gaussian source changed during verification: ${item.file}`,
            );
          digest = { identity: item.identity, sha256: hash.digest("hex") };
        } finally {
          await handle.close();
        }
        await unchanged(item);
      }
      if (digest.sha256 !== item.sha256)
        throw Error(`Gaussian source SHA-256 mismatch: ${item.file}`);
      cache.delete(item.canonical);
      cache.set(item.canonical, digest);
      while (cache.size > CACHE_ENTRIES)
        cache.delete(cache.keys().next().value!);
    }
    // A file already hashed can change while later files are read. Recheck the
    // whole snapshot, including symlinks, before issuing any source proof.
    for (const item of snapshots) await unchanged(item);
    if ((await realpath(assetRoot)) !== root)
      throw Error("Gaussian asset root changed during verification");
    return { gaussianHash, verifiedFileCount: inventory.length };
  });
  pending = result.then(
    (): void => {},
    (): void => {},
  );
  return result;
}
