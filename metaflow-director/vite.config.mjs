import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { typeExports } from "./upstream/source-adapter.mjs";
import { precisionPatch } from "./upstream/precision-patch.mjs";
import { opticsPatch } from "./upstream/optics-patch.mjs";
import { canvasPatch } from "./upstream/canvas-patch.mjs";
const root = path.dirname(fileURLToPath(import.meta.url)),
  repo = path.resolve(root, "..");
const upstream = path.join(
  repo,
  ".codex-work/downloads/director-source/supersplat-f76e67633f21b298846c29eceab48ae20579fb4e/src",
);
const dependencies = Object.keys(
  JSON.parse(fs.readFileSync(path.join(root, "package.json"))).dependencies,
);
export default defineConfig({
  root,
  base: "/director/",
  esbuild: { jsx: "automatic" },
  plugins: [
    {
      name: "pinned-photography-source",
      enforce: "pre",
      transform(code, id) {
        if (!id.startsWith(upstream)) return;
        if (id.endsWith("/controllers.ts"))
          code = code.replace(
            "destroy = () => {\n                destroy?.();",
            "const previousDestroy=destroy;\n            destroy = () => {\n                previousDestroy?.();",
          );
        return canvasPatch(
          typeExports(precisionPatch(opticsPatch(code, id), id), id).replace(
            /(?<!type )\bWriteTarget(?=\s*[,}])/g,
            "type WriteTarget",
          ),
          id,
        );
      },
    },
    {
      name: "same-origin-resource-development",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/data/")) return next();
          let pathname;
          try {
            pathname = decodeURIComponent(req.url.split("?")[0]);
          } catch {
            res.statusCode = 400;
            return res.end();
          }
          // Only a trusted local environment setting may select the read-only data directory.
          const base = path.resolve(
            process.env.METAFLOW_DATA_ROOT || path.join(repo, "data"),
          );
          const file = path.resolve(base, pathname.slice(6));
          if (
            !file.startsWith(base + path.sep) ||
            !fs.existsSync(file) ||
            !fs.statSync(file).isFile()
          ) {
            res.statusCode = 404;
            return res.end("Resource not found");
          }
          res.setHeader(
            "Content-Type",
            file.endsWith(".json")
              ? "application/json"
              : file.endsWith(".webp")
                ? "image/webp"
                : file.endsWith(".jpg")
                  ? "image/jpeg"
                  : "application/octet-stream",
          );
          res.setHeader("Content-Length", fs.statSync(file).size);
          fs.createReadStream(file).pipe(res);
        });
      },
    },
  ],
  resolve: {
    alias: [
      { find: "@upstream", replacement: upstream },
      { find: "@diagnostic", replacement: path.join(root, "src/render") },
      {
        find: "@playcanvas/splat-transform/viewer-settings",
        replacement: path.join(
          root,
          "node_modules/@playcanvas/splat-transform/dist/viewer-settings.mjs",
        ),
      },
      ...dependencies.map((find) => ({
        find,
        replacement: path.join(root, "node_modules", find),
      })),
    ],
  },
  server: {
    fs: { allow: [repo, upstream] },
    host: "127.0.0.1",
    port: 5206,
    strictPort: true,
  },
  build: {
    target: "esnext",
    outDir: path.join(repo, ".codex-work/tmp/director-dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(root, "src/main.tsx"),
      output: {
        entryFileNames: "entry.js",
        assetFileNames: (asset) =>
          asset.name?.endsWith(".css")
            ? "style.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});
