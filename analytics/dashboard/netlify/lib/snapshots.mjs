import { createHmac, timingSafeEqual } from "node:crypto";
import { validateAnalytics, validateServer } from "./validate.mjs";

export const PUBLIC_PATHS = {
  "/api/public/v1/analytics/7d.json": ["analytics", "7d"],
  "/api/public/v1/analytics/30d.json": ["analytics", "30d"],
  "/api/public/v1/server.json": ["server", null],
};
export function reply(status, body, cache = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cache
        ? "public, max-age=0, must-revalidate"
        : "no-store",
      "Netlify-CDN-Cache-Control": cache
        ? "public, durable, s-maxage=30, must-revalidate"
        : "no-store",
    },
  });
}
export async function readPublic(request, store) {
  const path = new URL(request.url).pathname;
  if (!Object.hasOwn(PUBLIC_PATHS, path))
    return reply(404, { error: "not_found" });
  if (!["GET", "HEAD"].includes(request.method))
    return reply(405, { error: "method_not_allowed" });
  try {
    const [key, period] = PUBLIC_PATHS[path],
      record = await store.get(key, { type: "json" });
    if (!record?.current) return reply(404, { error: "preparing" });
    const body = period ? record.current[period] : record.current;
    const response = reply(200, body, true);
    return request.method === "HEAD"
      ? new Response(null, { status: 200, headers: response.headers })
      : response;
  } catch {
    return reply(503, { error: "snapshot_unavailable" });
  }
}
function generation(key, value) {
  return Date.parse(
    key === "analytics" ? value["7d"].generated_at : value.generated_at,
  );
}
export async function saveSnapshot(store, key, current) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await store.getWithMetadata(key, { type: "json" });
    if (previous?.data?.current) {
      const old = previous.data.current,
        age = generation(key, current) - generation(key, old);
      if (age < 0) throw new Error("older_snapshot");
      if (age === 0) {
        if (JSON.stringify(old) === JSON.stringify(current)) return;
        throw new Error("generation_conflict");
      }
    }
    const result = await store.setJSON(
      key,
      { current, previous: previous?.data?.current ?? null },
      previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true },
    );
    if (result.modified) return;
  }
  throw new Error("write_conflict");
}
export async function receiveServer(request, store, secret, now = Date.now()) {
  if (request.method !== "POST")
    return reply(405, { error: "method_not_allowed" });
  if (!secret) return reply(503, { error: "publisher_not_configured" });
  const stamp = request.headers.get("X-Metaflow-Time"),
    signature = request.headers.get("X-Metaflow-Signature");
  if (
    !/^\d{10}$/.test(stamp ?? "") ||
    Math.abs(Number(stamp) * 1000 - now) > 60000 ||
    !/^[a-f0-9]{64}$/.test(signature ?? "")
  )
    return reply(401, { error: "unauthorized" });
  if (
    !(request.headers.get("Content-Type") ?? "").startsWith("application/json")
  )
    return reply(415, { error: "json_required" });
  const reader = request.body?.getReader();
  if (!reader) return reply(400, { error: "invalid_snapshot" });
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 256 * 1024) {
      await reader.cancel();
      return reply(413, { error: "too_large" });
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks),
    expected = createHmac("sha256", secret)
      .update(stamp + "\n")
      .update(bytes)
      .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    return reply(401, { error: "unauthorized" });
  let data;
  try {
    data = validateServer(JSON.parse(bytes.toString("utf8")), now);
    if (now - Date.parse(data.generated_at) > 180000) throw Error();
  } catch {
    return reply(400, { error: "invalid_snapshot" });
  }
  try {
    await saveSnapshot(store, "server", data);
    return reply(200, { accepted: true, generated_at: data.generated_at });
  } catch (error) {
    return reply(
      ["older_snapshot", "generation_conflict", "write_conflict"].includes(
        error.message,
      )
        ? 409
        : 503,
      { error: "snapshot_not_published" },
    );
  }
}
export async function refreshAnalytics(
  query,
  store,
  catalog,
  now = Date.now(),
) {
  const data = await query();
  if (!data || Object.keys(data).sort().join(",") !== "30d,7d")
    throw Error("invalid_snapshot");
  for (const days of [7, 30])
    validateAnalytics(data[`${days}d`], days, catalog, now);
  if (
    data["7d"].generated_at !== data["30d"].generated_at ||
    now - Date.parse(data["7d"].generated_at) > 1800000
  )
    throw Error("invalid_snapshot");
  await saveSnapshot(store, "analytics", data);
}
