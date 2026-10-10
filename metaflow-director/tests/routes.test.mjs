import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { siteHtml } from "../../metaflow-viewer/site-html.mjs";
const out = await build({
  entryPoints: ["../metaflow-viewer/src/director-handoff.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const api = await import(
  "data:text/javascript;base64," +
    Buffer.from(out.outputFiles[0].text).toString("base64")
);
const index = JSON.parse(await readFile("../data/index.json"));
const eligible = index.resources.filter(
  (r) => r.category.includes("acg") && /\.(sog|ply)$/i.test(r.files.model),
);
const storage = () => {
  const store = new Map();
  return {
    setItem: (k, v) => store.set(k, v),
    getItem: (k) => store.get(k) ?? null,
  };
};
test("every eligible canonical path, alias, trailing slash and encoded route resolves to the same resource", () => {
  assert(eligible.length > 0);
  for (const r of eligible)
    for (const route of [r.route, ...(r.aliases ?? [])])
      for (const url of [
        route + "/director",
        route + "/director/",
        encodeURI(route) + "/director",
      ])
        assert.equal(
          api.resolveDirectorResource(index.resources, url).id,
          r.id,
        );
});
test("streaming, non-ACG, unknown and arbitrary model URL cannot enter photography", () => {
  for (const r of index.resources.filter((r) => !eligible.includes(r)))
    assert.throws(() =>
      api.resolveDirectorResource(index.resources, r.route + "/director"),
    );
  assert.throws(() =>
    api.resolveDirectorResource(index.resources, "/missing/director"),
  );
  for (const file of [
    "https://example.com/a.sog",
    "../a.sog",
    "/etc/passwd",
    "foo\\bar.ply",
  ])
    assert.throws(() => api.resourceDataUrl(file));
  assert.equal(
    api.resourceDataUrl("ACG/中文 目录/a.sog"),
    "/data/ACG/%E4%B8%AD%E6%96%87%20%E7%9B%AE%E5%BD%95/a.sog",
  );
});
test("same resource and exact full precision position survive; different assets, expiry, invalid and unavailable storage fall back", () => {
  const r = eligible[0],
    identity = api.handoffIdentity(r),
    s = storage(),
    p = {
      position: [-0.7729818820953369, 0.44409406185150146, 0.46443819999694824],
      target: [-0.024445065209787065, 0.3166000324639885, -1.227737577812384],
    };
  assert(api.saveDirectorPosition(s, identity, p, 100));
  assert.deepEqual(api.readDirectorPosition(s, identity, 200), p);
  assert.equal(
    api.readDirectorPosition(s, identity, 100 + api.HANDOFF_TTL + 1),
    null,
  );
  assert.equal(api.readDirectorPosition(s, identity + "other", 200), null);
  assert.equal(api.readDirectorPosition(s, identity, 99), null);
  assert.equal(
    api.saveDirectorPosition(s, identity, {
      position: [0, 0, 0],
      target: [0, 0, 0],
    }),
    false,
  );
  assert.equal(
    api.saveDirectorPosition(
      {
        setItem() {
          throw Error("denied");
        },
      },
      identity,
      p,
    ),
    false,
  );
  assert.equal(
    api.readDirectorPosition(
      {
        getItem() {
          throw Error("denied");
        },
      },
      identity,
    ),
    null,
  );
});
test("Viewer bootstrap never imports the engine on the Director branch", async () => {
  const html = siteHtml(
    await readFile("../metaflow-viewer/src/index.html", "utf8"),
  );
  assert(!html.includes("import { createViewer } from './index.js'"));
  assert(html.includes("await (async function loadDirectorEntry("));
  assert(html.includes("await importer(`/director/entry.js${attempt"));
  assert(html.includes("new URL('./index.js', baseUrl)"));
  assert.match(
    html,
    /if \(window\.metaflowDirectorPath\)[\s\S]*await \(async function loadDirectorEntry\([\s\S]*\}\)\(\);\s*\} else \{\s*const \{ createViewer \} = await \(async function loadViewerEntry\(/,
  );
});
