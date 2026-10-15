import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config.mjs";
import { composition, maskComposition } from "../src/composition.mjs";
import { dir, loadPlaywright, binaries, run } from "./runtime.mjs";

const tools = binaries();
const work = path.join(dir, ".tools", "render");
const dist = path.join(dir, "dist");
const qa = path.join(dir, "qa");
const capturePath = path.join(dir, config.capture);
const capture = JSON.parse(await readFile(capturePath, "utf8"));
const sourcePath = path.resolve(path.dirname(capturePath), capture.source);
const sourceSha256 = createHash("sha256")
  .update(await readFile(sourcePath))
  .digest("hex");
const logoPath = path.resolve(dir, config.logo);
const logo = `data:image/jpeg;base64,${(await readFile(logoPath)).toString("base64")}`;
await Promise.all(
  [work, dist, qa].map((folder) => mkdir(folder, { recursive: true })),
);
const { stdout: sourceInfo } = await run(tools.ffprobe, [
  "-v",
  "error",
  "-show_streams",
  "-show_format",
  "-of",
  "json",
  sourcePath,
]);
const source = JSON.parse(sourceInfo);
const sourceVideo = source.streams.find(
  (stream) => stream.codec_type === "video",
);
assert.equal(
  sourceVideo?.width,
  config.width,
  "El bruto debe tener el viewport declarado.",
);
assert.equal(sourceVideo.height, config.height);
const { stdout: frameInfo } = await run(tools.ffprobe, [
  "-v",
  "error",
  "-select_streams",
  "v:0",
  "-show_frames",
  "-show_entries",
  "frame=best_effort_timestamp_time",
  "-of",
  "json",
  sourcePath,
]);
const sourceFrames = JSON.parse(frameInfo).frames.map((frame) =>
  Number(frame.best_effort_timestamp_time),
);
assert.ok(
  sourceFrames.length > 0 && sourceFrames.every(Number.isFinite),
  "El bruto debe tener timestamps válidos.",
);
const fps = config.fps;
const transitionFrames = Math.round(config.transition.duration * fps);
const preFrames = Math.floor(transitionFrames / 2);
const postFrames = transitionFrames - preFrames;
assert.equal(
  config.scenes.length,
  11,
  "La composición requiere introducción, nueve módulos y cierre.",
);
assert.equal(
  capture.scenes.length,
  9,
  "La captura debe incluir los nueve módulos reales.",
);
assert.equal(
  config.scenes.reduce((total, scene) => total + scene.duration, 0),
  config.duration,
);
let boundary = 0;
for (const scene of config.scenes) {
  assert.equal(scene.start, boundary, `Intervalo discontinuo: ${scene.id}.`);
  assert.equal(scene.duration * fps, Math.round(scene.duration * fps));
  boundary += scene.duration;
}
assert.ok(
  transitionFrames >= 5 && transitionFrames <= 15,
  "La transición debe durar entre cinco y quince fotogramas.",
);
assert.equal(
  config.audio.enabled,
  false,
  "No se incorporó una pista musical licenciada a este proyecto.",
);

async function imageReady(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
}

async function frameCount(filename) {
  const { stdout } = await run(tools.ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=nb_read_frames:format=duration",
    "-of",
    "json",
    filename,
  ]);
  const result = JSON.parse(stdout);
  return {
    frames: Number(result.streams[0].nb_read_frames),
    duration: Number(result.format.duration),
  };
}

const summary = capture.scenes.find((scene) => scene.id === "summary");
assert.ok(summary, "Falta Resumen para la portada.");
const posterSource = path.join(work, "poster-source.png");
await run(tools.ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "warning",
  "-y",
  "-ss",
  String((summary.start + summary.end) / 2),
  "-i",
  sourcePath,
  "-frames:v",
  "1",
  "-update",
  "1",
  posterSource,
]);
const nativePosterCapture = (summary.screenshots || [])
  .map((filename) => path.resolve(path.dirname(capturePath), filename))
  .find(
    (filename) => filename.includes("summary-wide") && existsSync(filename),
  );
const posterScreenshot = `data:image/png;base64,${(await readFile(nativePosterCapture || posterSource)).toString("base64")}`;
const browser = await loadPlaywright().chromium.launch({
  headless: true,
  channel: "chrome",
});
const context = await browser.newContext({
  viewport: { width: config.width, height: config.height },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const rendered = [];
const reportScenes = [];
try {
  await page.setContent(
    composition({
      kind: "poster",
      logo,
      screenshot: posterScreenshot,
      final: true,
    }),
  );
  await imageReady(page);
  await page.screenshot({ path: path.join(dist, config.poster) });
  const posterHtml = composition({
    kind: "poster",
    logo,
    screenshot: posterScreenshot,
    final: true,
  });
  await writeFile(path.join(work, "poster.html"), posterHtml, "utf8");
  await page.setViewportSize({
    width: config.frame.width,
    height: config.frame.height,
  });
  await page.setContent(maskComposition());
  await page.screenshot({ path: path.join(work, "frame-mask.png") });
  await page.setViewportSize({ width: config.width, height: config.height });

  for (const [index, scene] of config.scenes.entries()) {
    const coreFrames = Math.round(scene.duration * fps);
    const leading = index === 0 ? 0 : preFrames;
    const trailing = index === config.scenes.length - 1 ? 0 : postFrames;
    const clipFrames = coreFrames + leading + trailing;
    const filename = path.join(
      work,
      `${String(index).padStart(2, "0")}-${scene.id}.mp4`,
    );
    console.log(
      `Composición ${index + 1}/11: ${scene.id}, ${clipFrames} frames con handles reales.`,
    );
    const sceneReport = {
      id: scene.id,
      title: scene.title,
      start: scene.start,
      end: scene.start + scene.duration,
      duration: scene.duration,
      coreFrames,
      clipFrames,
      leadingFrames: leading,
      trailingFrames: trailing,
    };
    if (scene.kind === "brand") {
      const framesDir = path.join(work, scene.id);
      await mkdir(framesDir, { recursive: true });
      for (let frame = 0; frame < clipFrames; frame++) {
        await page.setContent(
          composition({ kind: "brand", scene, frame, logo }),
        );
        await imageReady(page);
        await page.screenshot({
          path: path.join(framesDir, `${String(frame).padStart(4, "0")}.png`),
        });
      }
      await run(tools.ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-framerate",
        String(fps),
        "-i",
        path.join(framesDir, "%04d.png"),
        "-frames:v",
        String(clipFrames),
        "-c:v",
        "libx264",
        "-crf",
        "16",
        "-preset",
        "medium",
        "-threads",
        "4",
        "-pix_fmt",
        "yuv420p",
        "-an",
        filename,
      ]);
      sceneReport.animation = "frame-based HTML easing; original brand logo";
    } else {
      const actual = capture.scenes.find((item) => item.id === scene.id);
      assert.ok(actual, `Falta el módulo real ${scene.id}.`);
      assert.equal(
        actual.targetSeconds,
        scene.duration,
        `Duración de captura incoherente: ${scene.id}.`,
      );
      assert.ok(
        actual.end > actual.start && actual.start >= 0,
        "Intervalo real inválido.",
      );
      const coreTimestamps = sourceFrames.filter(
        (time) => time >= actual.start && time < actual.end,
      );
      assert.ok(
        coreTimestamps.length >= 2,
        `Faltan fotogramas reales de ${scene.id}.`,
      );
      const first = coreTimestamps[0];
      const last = coreTimestamps.at(-1);
      const scale = (coreFrames - 1) / fps / (last - first);
      const speed = 1 / scale;
      assert.ok(
        speed <= config.playback.maxSpeed,
        `La escena ${scene.id} exige una aceleración excesiva: ${speed}.`,
      );
      const desiredStart = first - leading / fps / scale;
      const desiredEnd = last + (trailing + 1) / fps / scale;
      const availableStart =
        actual.handles?.handleStart ??
        actual.start - (actual.handles?.before || 0);
      const availableEnd =
        actual.handles?.handleEnd ?? actual.end + (actual.handles?.after || 0);
      const eligible = sourceFrames.filter(
        (time) => time >= availableStart && time <= availableEnd,
      );
      const trimStart = eligible.filter((time) => time <= desiredStart).at(-1);
      const lastHandle = eligible.find((time) => time >= desiredEnd);
      assert.ok(
        Number.isFinite(trimStart) && Number.isFinite(lastHandle),
        `Faltan handles reales de ${scene.id}; capture .30 s adicionales sin loaders.`,
      );
      const trimEnd = lastHandle + 0.001;
      await page.setContent(
        composition({ kind: "ui", scene, logo, final: true }),
      );
      await imageReady(page);
      const background = path.join(work, `${scene.id}-frame.png`);
      await page.screenshot({ path: background });
      const maxZoom =
        scene.camera === "detail"
          ? config.camera.to
          : scene.camera === "static"
            ? config.camera.from
            : config.camera.overviewTo;
      const orientation =
        Math.round(config.camera.orientationSeconds * fps) + leading;
      const movingFrames = Math.max(1, clipFrames - orientation - 1);
      const progress = `min(max((on-${orientation})/${movingFrames},0),1)`;
      const zoom = `${config.camera.from}+${maxZoom - config.camera.from}*(1-cos(PI*${progress}))/2`;
      const x = scene.camera === "detail" ? "iw/2-iw/zoom/2" : "0";
      const y = scene.camera === "detail" ? "ih/2-ih/zoom/2" : "0";
      const { width, height } = config.frame;
      const filters = [
        `[0:v]trim=start=${trimStart}:end=${trimEnd},setpts=(PTS-${first}/TB)*${scale.toFixed(12)}+${leading}/(${fps}*TB),fps=${fps}:start_time=0:round=near:eof_action=pass,trim=end_frame=${clipFrames},setpts=N/(${fps}*TB),scale=${config.camera.upscale}:-1:flags=lanczos,zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${config.width}x${config.height}:fps=${fps},scale=${width}:${height}:flags=lanczos,format=rgba[ui]`,
        "[2:v]format=gray[mask]",
        "[ui][mask]alphamerge[rounded]",
        `[1:v][rounded]overlay=x=${config.frame.x}:y=${config.frame.y}:shortest=1:format=auto,format=yuv420p[out]`,
      ].join(";");
      await run(tools.ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-y",
        "-i",
        sourcePath,
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-i",
        background,
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-i",
        path.join(work, "frame-mask.png"),
        "-filter_complex_threads",
        "2",
        "-filter_complex",
        filters,
        "-map",
        "[out]",
        "-frames:v",
        String(clipFrames),
        "-r",
        String(fps),
        "-fps_mode",
        "cfr",
        "-c:v",
        "libx264",
        "-crf",
        "16",
        "-preset",
        "medium",
        "-threads",
        "4",
        "-pix_fmt",
        "yuv420p",
        "-an",
        filename,
      ]);
      Object.assign(sceneReport, {
        actualSourceBounds: {
          start: actual.start,
          end: actual.end,
          trimStart,
          trimEnd,
          firstCoreFrame: first,
          lastCoreFrame: last,
        },
        speed,
        zoom: {
          from: config.camera.from,
          to: maxZoom,
          anchor: scene.camera === "detail" ? "center" : "top-left",
          orientationSeconds: config.camera.orientationSeconds,
        },
        cursor: "real pointer and click events already recorded in source",
        clicks: actual.clicks || [],
      });
    }
    const segment = await frameCount(filename);
    assert.equal(
      segment.frames,
      clipFrames,
      `No se completaron los frames de ${scene.id}.`,
    );
    rendered.push(filename);
    reportScenes.push(sceneReport);
  }
} finally {
  await context.close();
  await browser.close();
}

const args = ["-hide_banner", "-loglevel", "warning", "-y"];
for (const filename of rendered) args.push("-threads", "2", "-i", filename);
const filters = rendered.map(
  (_, index) => `[${index}:v]settb=AVTB,setpts=PTS-STARTPTS[v${index}]`,
);
const transitions = [];
for (let index = 1; index < rendered.length; index++) {
  const offset = config.scenes[index].start - preFrames / fps;
  const left = index === 1 ? "v0" : `mix${index - 1}`;
  filters.push(
    `[${left}][v${index}]xfade=transition=${config.transition.kind}:duration=${transitionFrames / fps}:offset=${offset.toFixed(9)}[mix${index}]`,
  );
  transitions.push({
    boundary: config.scenes[index].start,
    start: offset,
    end: offset + transitionFrames / fps,
    frames: transitionFrames,
    kind: "crossfade without black frames",
  });
}
const finalPath = path.join(dist, config.output);
assert.notEqual(sourcePath, finalPath, "La captura original debe conservarse.");
args.push(
  "-filter_complex_threads",
  "2",
  "-filter_complex",
  filters.join(";"),
  "-map",
  `[mix${rendered.length - 1}]`,
  "-frames:v",
  String(config.duration * fps),
  "-r",
  String(fps),
  "-fps_mode",
  "cfr",
  "-c:v",
  "libx264",
  "-crf",
  "17",
  "-preset",
  "medium",
  "-threads",
  "4",
  "-pix_fmt",
  "yuv420p",
  "-an",
  "-movflags",
  "+faststart",
  finalPath,
);
console.log(
  "Disolvencias entre once escenas; exportación final de 1350 frames.",
);
await run(tools.ffmpeg, args);
const measured = await frameCount(finalPath);
assert.equal(
  measured.frames,
  config.duration * fps,
  "El MP4 debe tener exactamente 1350 frames.",
);
assert.ok(
  Math.abs(measured.duration - config.duration) < 0.000001,
  "El MP4 debe durar exactamente 45 s.",
);
assert.equal(
  createHash("sha256")
    .update(await readFile(sourcePath))
    .digest("hex"),
  sourceSha256,
  "El bruto original cambió durante el montaje.",
);
await writeFile(
  path.join(qa, "render.json"),
  JSON.stringify(
    {
      output: config.output,
      poster: config.poster,
      sourcePreserved: true,
      sourceSha256,
      source: capture.source,
      width: config.width,
      height: config.height,
      fps,
      duration: config.duration,
      frameCount: measured.frames,
      composition:
        "editable deterministic HTML brand cards and real browser clips, composed with FFmpeg",
      audio: "none; no licensed soundtrack supplied",
      frame: config.frame,
      cursor: config.cursor,
      transitions,
      scenes: reportScenes,
      posterSourceTime: (summary.start + summary.end) / 2,
      posterNativeScreenshot: nativePosterCapture
        ? path.basename(nativePosterCapture)
        : null,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(
  `Render terminado: ${finalPath}. Ejecute npm run verify y revise el video entero.`,
);
