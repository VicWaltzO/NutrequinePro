import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { dir } from "./runtime.mjs";

const files = new Map([
  [
    "/video.mp4",
    [path.join(dir, "dist/nutrequine-pro-showcase-45s-1080p.mp4"), "video/mp4"],
  ],
  [
    "/poster.png",
    [path.join(dir, "dist/nutrequine-pro-poster.png"), "image/png"],
  ],
]);
const server = createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>Nutrequine Pro · 45 s</title><style>body{margin:0;background:#f4f3f0;display:grid;place-items:center;min-height:100vh}video{width:min(96vw,1920px);border-radius:16px;box-shadow:0 15px 55px #0002}</style><video controls playsinline poster="/poster.png" src="/video.mp4"></video></html>',
    );
    return;
  }
  const entry = files.get(req.url);
  if (!entry) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const [file, type] = entry;
    const { size } = await stat(file);
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(match ? 206 : 200, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    createReadStream(file, { start, end }).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Primero ejecute npm run render.");
  }
});
server.listen(5188, "127.0.0.1", () =>
  console.log("Vista previa: http://127.0.0.1:5188 · Ctrl+C para cerrar."),
);
