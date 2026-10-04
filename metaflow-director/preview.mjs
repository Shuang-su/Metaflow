// Read-only combined release preview. No model copies and no old Director server.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = {
  director: path.join(repo, ".codex-work/tmp/director-dist"),
  data: path.resolve(process.env.METAFLOW_DATA_ROOT ?? path.join(repo, "data")),
  viewer: path.join(repo, "metaflow-viewer/public"),
  editor: path.join(repo, "metaflow-editor"),
};
const mime = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};
http
  .createServer((req, res) => {
    let url;
    try {
      url = decodeURIComponent(new URL(req.url, "http://local").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const area = url.startsWith("/director/")
      ? "director"
      : url.startsWith("/data/")
        ? "data"
        : url.startsWith("/editor/")
          ? "editor"
          : "viewer";
    const rel = area === "viewer" ? url.slice(1) : url.slice(area.length + 2);
    const base = roots[area];
    let file = path.resolve(base, rel || "index.html");
    if (!file.startsWith(base + "/")) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (area !== "viewer") {
        res.writeHead(404).end("Not found");
        return;
      }
      file = path.join(base, "index.html");
    }
    if (!fs.existsSync(file)) {
      res.writeHead(503).end("Build in progress");
      return;
    }
    const stat = fs.statSync(file);
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] ?? "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", stat.size);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(process.env.PORT ?? 5207), "127.0.0.1", () =>
    console.log("Release preview ready on 127.0.0.1:5207"),
  );
