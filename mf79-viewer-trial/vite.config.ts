import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import {
  readFileSync,
  createReadStream,
  statSync,
  mkdirSync,
  writeFileSync,
  statfsSync,
} from "node:fs";
import { resolve, relative, extname } from "node:path";
const project = fileURLToPath(new URL("..", import.meta.url));
export default defineConfig({
  worker: { format: "es" },
  plugins: [
    {
      // Development evidence only. No arbitrary filenames, no source writes and
      // no cross-origin access; screenshots stay in the project-local cache.
      name: "local-navigation-evidence",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/__mf79_evidence") return next();
          if (
            req.method !== "POST" ||
            req.headers.origin !== "http://127.0.0.1:5184" ||
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
              dir =
                "/Volumes/Prism/Metaflow/.codex-work/cache/mf79-native-evidence";
            const png =
                data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
              jpeg = data.subarray(0, 3).toString("hex") === "ffd8ff";
            if (!png && !jpeg) {
              res.statusCode = 400;
              res.end();
              return;
            }
            try {
              mkdirSync(dir, { recursive: true });
              const disk = statfsSync(dir);
              if (disk.bavail * disk.bsize < 10 * 1024 ** 3)
                throw Error("Disk reserve");
              const path = resolve(
                dir,
                `viewer-${Date.now()}.${png ? "png" : "jpg"}`,
              );
              writeFileSync(path, data);
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
      load(id) {
        if (id.endsWith("/metaflow-viewer/src/ui.html"))
          return (
            "export default " +
            JSON.stringify(
              readFileSync(id, "utf8").replace(/<!--[\s\S]*?-->/g, " "),
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
          if (pathname.startsWith("/scene-assets/")) {
            root = "/Volumes/Prism_初号機/3D高斯";
            part = pathname.slice("/scene-assets/".length);
          } else if (pathname.startsWith("/navigation/")) {
            root =
              "/Volumes/Prism/Metaflow/.codex-work/cache/mf79-native-viewer-v1";
            part = pathname.slice("/navigation/".length);
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
            ].includes(extname(p))
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          try {
            const st = statSync(p);
            if (!st.isFile()) throw Error();
            res.setHeader(
              "Content-Type",
              extname(p) === ".json"
                ? "application/json"
                : "application/octet-stream",
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
    port: 5184,
    strictPort: true,
    fs: {
      allow: [project],
      deny: ["**/.env*", "**/.git/**", "**/*.{pem,crt}"],
    },
  },
  build: {
    outDir: "/Volumes/Prism/Metaflow/.codex-work/tmp/mf79-native-preview-build",
    emptyOutDir: false,
  },
});
