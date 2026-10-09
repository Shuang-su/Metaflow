import { loadAssetConfig, resolveAssetUrl } from "../scripts/mf97/asset-config.mjs";
import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { groundAnalysisHash } from "./src/ground-analysis-fingerprint";
import { verifyGaussianJobSource } from "./src/verify-gaussian-source";
import { validateTrialBundle } from "./src/trial-bundle";
import {
  createOfflineResources,
  DEFAULT_CACHE_ROOT,
} from "./src/offline-resources";
import exhibitionScenes from "../mf79-viewer-trial/scene-exhibitions.json";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, createReadStream, statSync, realpathSync } from "node:fs";
import { resolve, relative, extname, dirname, basename } from "node:path";
const project = fileURLToPath(new URL("..", import.meta.url));
const assets = loadAssetConfig();
const sass = createRequire(import.meta.url)(
  resolve(project, "metaflow-viewer/node_modules/sass"),
);
export default defineConfig({
  worker: { format: "es" },
  plugins: [
    {
      name: "mf97-review-context",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/__mf97_review_context" || req.method !== "GET")
            return next();
          void (async () => {
            try {
              const sha = (b: Buffer) =>
                createHash("sha256").update(b).digest("hex");
              const scenes = [];
              for (const scene of exhibitionScenes.scenes) {
                const job = JSON.parse(
                  readFileSync(
                    resolve(
                      assets.roots.mapJobs,
                      `${scene.id}.json`,
                    ),
                    "utf8",
                  ),
                );
                const file = resolveAssetUrl(scene.collisionUrl, assets);
                const sourceHash =
                  sha(readFileSync(file)) +
                  ":" +
                  sha(readFileSync(file.replace(/\.json$/, ".bin")));
                if (sourceHash !== job.collisionHash)
                  throw Error("Review source changed");
                const gaussianProof = await verifyGaussianJobSource(
                  job,
                  dirname(
                    resolveAssetUrl(job.assetUrl, assets),
                  ),
                );
                scenes.push({
                  id: scene.id,
                  job,
                  sourceHash,
                  gaussianProof,
                  collisionUrl: scene.collisionUrl,
                  coverageUrl: `/mf97-ground/${scene.id}/coverage.json`,
                });
              }
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(
                JSON.stringify({ analysisHash: groundAnalysisHash(), scenes }),
              );
            } catch (error) {
              res.statusCode = 409;
              res.end(JSON.stringify({ error: String(error) }));
            }
          })();
        });
      },
    },
    {
      name: "mf97-native-styles",
      resolveId(id) {
        if (id === "virtual:mf97-viewer-styles") return "\0mf97-viewer-styles";
      },
      load(id) {
        if (id === "\0mf97-viewer-styles") {
          const css = sass.compile(
            resolve(project, "metaflow-viewer/src/index.scss"),
          ).css;
          return `const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.append(style);`;
        }
      },
    },
    {
      // Development evidence only. No arbitrary filenames, no source writes and
      // no cross-origin access; screenshots stay in the project-local cache.
      name: "local-navigation-evidence",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/__mf79_evidence") return next();
          if (
            req.method !== "POST" ||
            req.headers.origin !== "http://127.0.0.1:5185" ||
            !["image/png", "image/jpeg"].includes(
              req.headers["content-type"] ?? "",
            )
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          req.on("data", (chunk) => {
            size += chunk.length;
            if (size > 5 * 1024 * 1024) {
              req.destroy();
              return;
            }
            chunks.push(chunk);
          });
          req.on("end", () => {
            const data = Buffer.concat(chunks),
              dir = resolve(DEFAULT_CACHE_ROOT, "evidence");
            const png =
                data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
              jpeg = data.subarray(0, 3).toString("hex") === "ffd8ff";
            if (!png && !jpeg) {
              res.statusCode = 400;
              res.end();
              return;
            }
            try {
              const resources = createOfflineResources();
              resources.assertCapacity(data.length, "browser evidence");
              const path = resolve(
                dir,
                `viewer-${Date.now()}.${png ? "png" : "jpg"}`,
              );
              resources.writeFileAtomic(path, data);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ path }));
            } catch {
              res.statusCode = 507;
              res.end("Evidence resource limit");
            }
          });
        });
      },
    },
    {
      name: "viewer-ui-template",
      enforce: "pre",
      resolveId(source, importer) {
        if (source === "./ui.html" && importer?.endsWith("/metaflow-viewer/src/index.ts")) return "\0mf-viewer-ui-template.js";
      },
      load(id) {
        if (id === "\0mf-viewer-ui-template.js")
          return (
            "export default " +
            JSON.stringify(
              readFileSync(resolve(project, "metaflow-viewer/src/ui.html"), "utf8").replace(/<!--[\s\S]*?-->/g, " "),
            )
          );
      },
    },
    {
      name: "readonly-trial-assets",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const pathname = decodeURIComponent((req.url ?? "").split("?")[0]);
          let root: string, part: string;
          if (pathname.startsWith("/mf97-trial-bundles/")) {
            const match = pathname.match(/^\/mf97-trial-bundles\/([a-f0-9]{24})\/(bundle\.json|navigation-manifest\.json|map-manifest\.json|nav\.bin|collision\.bin|nav-positions\.bin|nav-indices\.bin)$/);
            if (!match) { res.statusCode = 404; res.end("Unknown trial asset"); return; }
            try {
              root = resolve(DEFAULT_CACHE_ROOT, "trial-bundles", match[1]);
              const bundle = validateTrialBundle(JSON.parse(readFileSync(resolve(root, "bundle.json"), "utf8")), match[1], "apms-2026");
              if (createHash("sha256").update(JSON.stringify(bundle.identity)).digest("hex").slice(0,24) !== match[1]) throw Error("Trial identity changed");
              part = match[2];
              if (part.endsWith(".bin")) {
                const navigationRoot = resolve(DEFAULT_CACHE_ROOT, "navigation");
                const directory = resolve(bundle.identity.inputs.navDirectory);
                if (!directory.startsWith(navigationRoot + "/")) throw Error("Trial navigation escaped output root");
                root = directory;
              }
            } catch { res.statusCode = 409; res.end("Trial asset identity unavailable"); return; }
          } else if (pathname.startsWith("/scene-assets/")) {
            try {
              const file = resolveAssetUrl(pathname, assets);
              root = dirname(file); part = basename(file);
            } catch (error) { res.statusCode = 409; res.end(String(error)); return; }
          } else if (pathname.startsWith("/navigation/")) {
            root =
              assets.roots.navigation;
            part = pathname.slice("/navigation/".length);
          } else if (pathname.startsWith("/mf97-maps/")) {
            root =
              assets.roots.maps;
            part = pathname.slice("/mf97-maps/".length);
          } else if (pathname.startsWith("/mf97-continuation-maps/")) {
            root = resolve(DEFAULT_CACHE_ROOT, "maps");
            part = pathname.slice("/mf97-continuation-maps/".length);
          } else if (pathname.startsWith("/mf97-accepted/")) {
            root = resolve(DEFAULT_CACHE_ROOT, "accepted");
            part = pathname.slice("/mf97-accepted/".length);
          } else if (pathname.startsWith("/repository-data/")) {
            try {
              const file = resolveAssetUrl(pathname, assets);
              root = dirname(file); part = basename(file);
            } catch (error) { res.statusCode = 409; res.end(String(error)); return; }
          } else if (pathname.startsWith("/studio/")) {
            root = assets.roots.studioBuild;
            part = pathname.slice("/studio/".length) || "index.html";
          } else if (pathname.startsWith("/mf97-ground/")) {
            root =
              process.env.MF97_GROUND_ROOT ??
              resolve(DEFAULT_CACHE_ROOT, "ground-v2");
            part = pathname.slice("/mf97-ground/".length);
          } else return next();
          const p = resolve(root, part);
          if (
            relative(root, p).startsWith("..") ||
            ![
              ".json",
              ".bin",
              ".webp",
              ".png",
              ".jpg",
              ".sog",
              ".ply",
              ".html",
              ".js",
              ".css",
              ".svg",
              ".wasm",
              ".woff2",
              ".ttf",
              ".ico",
            ].includes(extname(p))
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          try {
            const st = statSync(p);
            if (!st.isFile()) throw Error();
            if (pathname.startsWith("/mf97-accepted/")) {
              const match = part.match(/^([a-f0-9]{24})\/walk\.voxel\.(json|bin)$/);
              if (!match) throw Error("Unknown accepted collision asset");
              const material = JSON.parse(readFileSync(resolve(root, match[1], "materialization.json"), "utf8"));
              const expected = material.outputHash?.split(":")[match[2] === "json" ? 0 : 1];
              if (material.complete !== true || createHash("sha256").update(readFileSync(p)).digest("hex") !== expected)
                throw Error("Accepted collision source changed");
            }
            if (
              pathname.startsWith("/navigation/") &&
              part.endsWith("/manifest.json")
            ) {
              const manifest = JSON.parse(readFileSync(p, "utf8"));
              const jobPath = resolve(
                assets.roots.mapJobs,
                `${manifest.scene}.json`,
              );
              const job = JSON.parse(readFileSync(jobPath, "utf8"));
              if (
                job.scene !== manifest.scene ||
                job.collisionHash !== manifest.sourceHash
              )
                throw Error("Map provenance mismatch");
              // Local metadata overlay only: preserve the MF79 cache and all original assets.
              const bytes = Buffer.from(
                JSON.stringify({
                  ...manifest,
                  mapsUrl: `/mf97-maps/${manifest.scene}/manifest.json`,
                  mapSource: {
                    gaussianHash: job.gaussianHash,
                    transform: job.transform,
                  },
                }),
              );
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("Content-Length", bytes.length);
              if (req.method === "HEAD") res.end();
              else res.end(bytes);
              return;
            }
            res.setHeader(
              "Content-Type",
              (
                {
                  ".json": "application/json",
                  ".html": "text/html",
                  ".js": "text/javascript",
                  ".css": "text/css",
                  ".svg": "image/svg+xml",
                  ".wasm": "application/wasm",
                  ".webp": "image/webp",
                  ".png": "image/png",
                  ".jpg": "image/jpeg",
                  ".ttf": "font/ttf",
                } as Record<string, string>
              )[extname(p)] ?? "application/octet-stream",
            );
            const tag = `\"${st.size}-${st.mtimeMs}\"`;
            res.setHeader("ETag", tag);
            res.setHeader(
              "Cache-Control",
              extname(p) === ".json" ? "no-cache" : "private,max-age=3600",
            );
            res.setHeader("Accept-Ranges", "bytes");
            if (req.headers["if-none-match"] === tag) {
              res.statusCode = 304;
              res.end();
              return;
            }
            const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
            if (range) {
              const start = +range[1],
                end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
              if (start > end) {
                res.statusCode = 416;
                res.end();
                return;
              }
              res.statusCode = 206;
              res.setHeader(
                "Content-Range",
                `bytes ${start}-${end}/${st.size}`,
              );
              res.setHeader("Content-Length", end - start + 1);
              createReadStream(p, { start, end }).pipe(res);
            } else {
              res.setHeader("Content-Length", st.size);
              if (req.method === "HEAD") res.end();
              else createReadStream(p).pipe(res);
            }
          } catch {
            res.statusCode = 404;
            res.end("Asset not available");
          }
        });
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^playcanvas$/,
        replacement: resolve(
          project,
          "metaflow-viewer/node_modules/playcanvas/build/playcanvas/src/index.js",
        ),
      },
    ],
  },
  server: {
    hmr: false,
    host: "127.0.0.1",
    port: 5185,
    strictPort: true,
    fs: {
      allow: [
        project,
        realpathSync(resolve(project, "metaflow-viewer/node_modules")),
        realpathSync(resolve(project, "mf97-viewer-trial/node_modules")),
      ],
      deny: ["**/.env*", "**/.git/**", "**/*.{pem,crt}"],
    },
  },
  build: {
    outDir: assets.roots.previewBuild,
    emptyOutDir: false,
  },
});
