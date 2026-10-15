import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { dir, binaries, loadPlaywright, run } from "./runtime.mjs";
import config from "../src/config.mjs";

const file = path.join(dir, "dist/nutrequine-pro-showcase-45s-1080p.mp4");
const poster = path.join(dir, "dist/nutrequine-pro-poster.png");
const qa = path.join(dir, "qa");
await mkdir(qa, { recursive: true });
const { ffmpeg, ffprobe } = binaries();
const totalFrames = config.duration * config.fps;
assert.equal(config.duration, 45);
assert.equal(config.fps, 30);
assert.equal(totalFrames, 1350);
const parsed = JSON.parse(
  (
    await run(ffprobe, [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ])
  ).stdout,
);
parsed.format.filename = path.basename(file);
assert.equal(
  parsed.streams.length,
  1,
  "La exportación prevista no debe incluir audio sin licencia.",
);
const video = parsed.streams[0];
assert.equal(video.codec_type, "video");
assert.equal(video.codec_name, "h264");
assert.equal(video.width, 1920);
assert.equal(video.height, 1080);
assert.equal(video.pix_fmt, "yuv420p");
assert.equal(video.r_frame_rate, "30/1");
assert.equal(video.avg_frame_rate, "30/1");
assert.equal(Number(video.nb_read_frames), totalFrames);
assert.ok(Math.abs(Number(video.duration) - 45) < 0.000001);
assert.ok(Math.abs(Number(parsed.format.duration) - 45) < 0.000001);
const frames = JSON.parse(
  (
    await run(ffprobe, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_frames",
      "-show_entries",
      "frame=best_effort_timestamp_time",
      "-of",
      "json",
      file,
    ])
  ).stdout,
).frames;
assert.equal(frames.length, totalFrames);
const timestamps = frames.map((frame) =>
  Number(frame.best_effort_timestamp_time),
);
const maxTimestampError = Math.max(
  ...timestamps.map((time, i) => Math.abs(time - i / config.fps)),
);
assert.ok(
  maxTimestampError <= 0.000002,
  "La salida debe ser CFR real, fotograma por fotograma.",
);
const bytes = await readFile(file);
const atoms = [];
for (let offset = 0; offset + 8 <= bytes.length; ) {
  const size = bytes.readUInt32BE(offset);
  assert.ok(size >= 8 && offset + size <= bytes.length, "Átomo MP4 inválido.");
  atoms.push({
    type: bytes.toString("ascii", offset + 4, offset + 8),
    offset,
    size,
  });
  offset += size;
}
assert.ok(
  atoms.find((atom) => atom.type === "moov")?.offset <
    atoms.find((atom) => atom.type === "mdat")?.offset,
  "Falta +faststart.",
);
const black = await run(ffmpeg, [
  "-hide_banner",
  "-i",
  file,
  "-vf",
  "blackdetect=d=0.01:pix_th=0.10:pic_th=0.98",
  "-an",
  "-f",
  "null",
  "-",
]);
const blackSegments = [
  ...black.stderr.matchAll(
    /black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g,
  ),
].map((match) => ({
  start: Number(match[1]),
  end: Number(match[2]),
  duration: Number(match[3]),
}));
await writeFile(
  path.join(qa, "blackdetect.json"),
  JSON.stringify(
    {
      filter: "blackdetect=d=0.01:pix_th=0.10:pic_th=0.98",
      passed: blackSegments.length === 0,
      segments: blackSegments,
    },
    null,
    2,
  ) + "\n",
);
assert.deepEqual(blackSegments, [], "Se detectó un cuadro negro accidental.");
await run(ffmpeg, [
  "-hide_banner",
  "-v",
  "error",
  "-i",
  file,
  "-f",
  "null",
  "-",
]);

const regularFrames = Array.from({ length: 15 }, (_, i) => i * 90).concat(1349);
const boundaries = config.scenes
  .slice(1)
  .map((scene) => Math.round(scene.start * config.fps));
const boundaryFrames = boundaries.flatMap((frame) => [
  frame - 1,
  frame,
  frame + 1,
]);
async function sheet(selected, columns, filename) {
  await run(ffmpeg, [
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-i",
    file,
    "-vf",
    `select='${selected.map((n) => `eq(n,${n})`).join("+")}',scale=${1920 / columns}:${1080 / columns}:flags=lanczos,tile=${columns}x${Math.ceil(selected.length / columns)}`,
    "-frames:v",
    "1",
    "-update",
    "1",
    path.join(qa, filename),
  ]);
}
await sheet(regularFrames, 4, "contact-sheet.png");
await sheet(boundaryFrames, 6, "transitions.png");
const sceneFrames = config.scenes.map((scene) =>
  Math.round((scene.start + scene.duration * 0.65) * config.fps),
);
await run(ffmpeg, [
  "-hide_banner",
  "-v",
  "error",
  "-y",
  "-i",
  file,
  "-vf",
  `select='${sceneFrames.map((n) => `eq(n,${n})`).join("+")}'`,
  "-fps_mode",
  "vfr",
  "-frames:v",
  String(sceneFrames.length),
  path.join(qa, "scene-%02d.png"),
]);
await run(ffmpeg, [
  "-hide_banner",
  "-v",
  "error",
  "-y",
  "-i",
  file,
  "-vf",
  "select='eq(n,1349)'",
  "-frames:v",
  "1",
  "-update",
  "1",
  path.join(qa, "last-frame.png"),
]);
const image = JSON.parse(
  (await run(ffprobe, ["-v", "error", "-show_streams", "-of", "json", poster]))
    .stdout,
).streams[0];
assert.equal(image.width, 1920);
assert.equal(image.height, 1080);
assert.equal(image.codec_name, "png");
const capture = JSON.parse(
  await readFile(path.join(dir, "data/capture.json"), "utf8"),
);
const required = [
  "summary",
  "production",
  "inventory",
  "sales",
  "collections",
  "expenses",
  "balance",
  "customers",
  "configuration",
];
assert.deepEqual(
  capture.scenes.map((scene) => scene.id),
  required,
);
const e2e = JSON.parse(await readFile(path.join(qa, "e2e.json"), "utf8"));
assert.equal(e2e.passed, true, "Los estados capturados deben pasar E2E.");
assert.deepEqual(e2e.errors, []);
assert.deepEqual(e2e.failedRequests, []);

async function playback() {
  const { size } = await stat(file);
  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<!doctype html><html><meta charset="utf-8"><style>body{margin:0}video{width:100vw;height:100vh}</style><video src="/video.mp4" muted playsinline preload="auto"></video></html>',
      );
      return;
    }
    if (req.url !== "/video.mp4") {
      res.writeHead(204);
      res.end();
      return;
    }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    createReadStream(file, { start, end }).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await loadPlaywright().chromium.launch({
      channel: process.env.DEMO_BROWSER_CHANNEL || "chrome",
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    console.log(
      "Reproduciendo los 45 segundos completos, sin saltos y a velocidad 1...",
    );
    const result = await page.evaluate(async () => {
      const video = document.querySelector("video");
      await new Promise((resolve, reject) => {
        if (video.readyState >= 4) resolve();
        else {
          video.addEventListener("canplaythrough", resolve, { once: true });
          video.addEventListener(
            "error",
            () => reject(new Error("No se puede abrir el MP4")),
            { once: true },
          );
        }
      });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      let lastTime = -1,
        callbacks = 0,
        monotonic = true;
      const observe = (_, metadata) => {
        callbacks++;
        monotonic &&= metadata.mediaTime >= lastTime;
        lastTime = metadata.mediaTime;
        if (!video.ended) video.requestVideoFrameCallback(observe);
      };
      video.requestVideoFrameCallback(observe);
      const started = performance.now();
      const ended = new Promise((resolve, reject) => {
        video.addEventListener("ended", resolve, { once: true });
        video.addEventListener(
          "error",
          () => reject(new Error(`Error de video ${video.error?.code}`)),
          { once: true },
        );
        setTimeout(() => {
          if (!video.ended)
            reject(new Error("Reproducción excede 65 segundos"));
        }, 65000);
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
        playbackRate: video.playbackRate,
        elapsedSeconds: (performance.now() - started) / 1000,
        lastPresentedTime: lastTime,
        callbacks,
        monotonic,
        totalVideoFrames: quality.totalVideoFrames,
        droppedVideoFrames: quality.droppedVideoFrames,
        error: video.error?.code || null,
      };
    });
    try {
      assert.equal(result.ended, true);
      assert.equal(result.duration, 45);
      assert.equal(result.currentTime, 45);
      assert.deepEqual([result.width, result.height], [1920, 1080]);
      assert.equal(result.playbackRate, 1);
      assert.equal(result.error, null);
      assert.equal(result.monotonic, true);
      assert.ok(result.lastPresentedTime >= 44.9);
      assert.ok(result.elapsedSeconds >= 44.5 && result.elapsedSeconds <= 65);
      assert.equal(result.totalVideoFrames, totalFrames);
      assert.equal(result.droppedVideoFrames, 0);
      assert.deepEqual(errors, []);
    } catch (error) {
      await writeFile(
        path.join(qa, "playback-failure.json"),
        JSON.stringify({ ...result, errors, failure: error.message }, null, 2) +
          "\n",
      );
      throw error;
    }
    return { passed: true, ...result, errors };
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
const played = await playback();
await writeFile(
  path.join(qa, "playback.json"),
  JSON.stringify(played, null, 2) + "\n",
);
const report = {
  passed: true,
  artifact: path.relative(dir, file).replaceAll("\\", "/"),
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  ffprobe: parsed,
  frameCount: totalFrames,
  maxTimestampErrorSeconds: maxTimestampError,
  faststart: true,
  atoms,
  blackdetect: {
    filter: "blackdetect=d=0.01:pix_th=0.10:pic_th=0.98",
    segments: blackSegments,
  },
  fullDecodePassed: true,
  silent: true,
  poster: {
    artifact: path.basename(poster),
    width: image.width,
    height: image.height,
    bytes: (await stat(poster)).size,
  },
  modules: required,
  realCaptureE2EPassed: true,
  sceneFrames,
  contactFrames: regularFrames,
  transitionFrames: boundaryFrames,
  playback: played,
};
await writeFile(
  path.join(qa, "verification.json"),
  JSON.stringify(report, null, 2) + "\n",
);
await writeFile(
  path.join(qa, "timestamps.json"),
  JSON.stringify({ fps: 30, expectedFrames: 1350, timestamps }, null, 2) + "\n",
);
console.log(
  `APROBADO: 45.000 s, 1350 frames, 1080p, H.264, CFR 30 FPS, sin cuadros negros ni audio; reproducción completa (${played.elapsedSeconds.toFixed(2)} s).`,
);
