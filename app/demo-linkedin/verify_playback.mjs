import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import path from "node:path";

const dir = fileURLToPath(new URL("./", import.meta.url));
const file = path.join(dir, "showcase_final.mp4");
assert.ok(existsSync(file), "Primero genere showcase_final.mp4.");
const size = (await stat(file)).size;
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(
    path.join(
      homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  );
}
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Nutrequine Pro · revisión del MP4</title>
<style>html,body{margin:0;background:#191b1e;width:100%;height:100%;overflow:hidden}video{width:100%;height:100%;object-fit:contain}</style>
<video src="/showcase_final.mp4" muted playsinline preload="auto"></video></html>`;
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  if (req.url !== "/showcase_final.mp4") {
    res.writeHead(204);
    res.end();
    return;
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
  const start = match ? Number(match[1]) : 0;
  const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    res.end();
    return;
  }
  res.writeHead(match ? 206 : 200, {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  });
  createReadStream(file, { start, end }).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await playwright.chromium.launch({
    channel: process.env.DEMO_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  console.log("Reproduciendo el MP4 completo, en tiempo real y sin saltos...");
  const result = await page.evaluate(async () => {
    const video = document.querySelector("video");
    await new Promise((resolve, reject) => {
      if (video.readyState >= 2) resolve();
      else {
        video.addEventListener("loadeddata", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error(`Error de video ${video.error?.code}`)), {
          once: true,
        });
      }
    });
    const started = performance.now();
    const samples = [];
    let callbacks = 0,
      lastTime = -1,
      monotonic = true;
    const observe = (_, metadata) => {
      callbacks++;
      if (metadata.mediaTime < lastTime) monotonic = false;
      lastTime = metadata.mediaTime;
      if (samples.length === 0 || metadata.mediaTime - samples.at(-1) >= 1) samples.push(metadata.mediaTime);
      if (!video.ended) video.requestVideoFrameCallback(observe);
    };
    video.requestVideoFrameCallback(observe);
    const ended = new Promise((resolve, reject) => {
      video.addEventListener("ended", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error(`Error de video ${video.error?.code}`)), {
        once: true,
      });
      setTimeout(() => {
        if (!video.ended) reject(new Error("Reproducción no termina en 45 segundos."));
      }, 45000);
    });
    await video.play();
    await ended;
    const quality = video.getVideoPlaybackQuality();
    return {
      ended: video.ended,
      duration: video.duration,
      currentTime: video.currentTime,
      width: video.videoWidth,
      height: video.videoHeight,
      elapsedSeconds: (performance.now() - started) / 1000,
      callbacks,
      lastPresentedTime: lastTime,
      monotonic,
      samples,
      totalVideoFrames: quality.totalVideoFrames,
      droppedVideoFrames: quality.droppedVideoFrames,
      playbackRate: video.playbackRate,
      muted: video.muted,
      error: video.error?.code || null,
    };
  });
  assert.equal(result.ended, true);
  assert.equal(result.duration, 30);
  assert.equal(result.currentTime, 30);
  assert.deepEqual([result.width, result.height], [1920, 1080]);
  assert.equal(result.playbackRate, 1);
  assert.equal(result.monotonic, true);
  assert.equal(result.error, null);
  assert.ok(result.lastPresentedTime >= 29.8);
  assert.ok(result.elapsedSeconds >= 29.5 && result.elapsedSeconds <= 45);
  assert.ok(result.totalVideoFrames >= 900);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, "qa", "playback.json"),
    JSON.stringify({ passed: true, artifact: "showcase_final.mp4", ...result, errors }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: true,
      ended: result.ended,
      duration: result.duration,
      decodedFrames: result.totalVideoFrames,
      droppedFrames: result.droppedVideoFrames,
      realSeconds: result.elapsedSeconds,
    }),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
