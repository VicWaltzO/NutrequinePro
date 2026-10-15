import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./", import.meta.url));
const shotsPath = path.resolve(process.argv[2] || path.join(dir, "shots.json"));
const qaDir = path.join(dir, "qa");
const renderDir = path.join(dir, ".raw", "render");
const finalPath = path.join(dir, "showcase_final.mp4");
const frameCounts = [90, 210, 210, 240, 150];
const labels = [null, "Control de producción", "Registro de ventas", "Seguimiento de cobros", null];
const fps = 30;

function binary(variable, name) {
  if (process.env[variable]) return process.env[variable];
  const portable = path.join(dir, ".tools", `${name}${process.platform === "win32" ? ".exe" : ""}`);
  return existsSync(portable) ? portable : name;
}
const ffmpeg = binary("FFMPEG_BINARY", "ffmpeg");
const ffprobe = binary("FFPROBE_BINARY", "ffprobe");

async function run(executable, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: dir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-16000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0)
        reject(new Error(`${path.basename(executable)} terminó con código ${code}:\n${stderr}`));
      else resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

async function probe(filename, frames = false) {
  const args = ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", filename];
  const result = JSON.parse(await run(ffprobe, args));
  // The report uses artifact names, without host-specific absolute paths.
  result.format.filename = path.basename(filename);
  if (frames) {
    const timestamps = JSON.parse(
      await run(ffprobe, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_frames",
        "-show_entries",
        "frame=best_effort_timestamp_time,pkt_duration_time,duration_time",
        "-of",
        "json",
        filename,
      ]),
    );
    result.frames = timestamps.frames;
  }
  return result;
}

function filterPath(filename) {
  // FFmpeg's filter parser has its own escaping rules, independent of shell quoting.
  return filename.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "'\\''");
}

function concatPath(filename) {
  return filename.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

const shots = JSON.parse(await readFile(shotsPath, "utf8"));
assert.equal(shots.scenes?.length, frameCounts.length, "El storyboard debe contener cinco escenas.");
assert.equal(typeof shots.source, "string", "shots.json debe identificar el WebM original.");
const sourcePath = path.resolve(path.dirname(shotsPath), shots.source);
assert.notEqual(sourcePath, finalPath, "El bruto debe conservarse separado del video final.");
assert.ok(existsSync(sourcePath), `No existe la captura original: ${sourcePath}`);
await mkdir(qaDir, { recursive: true });
await mkdir(renderDir, { recursive: true });

const source = await probe(sourcePath, true);
const sourceVideo = source.streams.find((stream) => stream.codec_type === "video");
assert.ok(sourceVideo, "La captura original no tiene video.");
assert.equal(sourceVideo.width, 1920, "La captura debe tener 1920 px de ancho.");
assert.equal(sourceVideo.height, 1080, "La captura debe tener 1080 px de alto.");
const sourceDuration = Number(source.format.duration);
assert.ok(Number.isFinite(sourceDuration) && sourceDuration > 0, "Duración del bruto inválida.");
const sourceTimestamps = source.frames.map((frame) => Number(frame.best_effort_timestamp_time));
assert.ok(sourceTimestamps.every(Number.isFinite), "El bruto contiene timestamps inválidos.");

const fontCandidates = [
  process.env.DEMO_OVERLAY_FONT,
  path.join(dir, "assets", "overlay-font.ttf"),
  "C:/Windows/Fonts/segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
].filter(Boolean);
const font = fontCandidates.find((filename) => existsSync(filename));
assert.ok(font, "Indique una fuente local mediante DEMO_OVERLAY_FONT.");
const fontArg = filterPath(font);
const sceneReports = [];
const renderedScenes = [];

for (const [index, scene] of shots.scenes.entries()) {
  const frames = frameCounts[index];
  const seconds = frames / fps;
  assert.equal(scene.seconds, seconds, `Duración editorial inválida de ${scene.name}.`);
  assert.ok(Number.isFinite(scene.start) && Number.isFinite(scene.end), "Timecodes inválidos.");
  assert.ok(scene.start >= 0 && scene.end > scene.start, "El tramo de origen está vacío.");
  assert.ok(scene.end <= sourceDuration + 0.05, `La escena ${scene.name} excede el bruto.`);
  if (index > 0)
    assert.ok(scene.start >= shots.scenes[index - 1].end, "Las escenas deben respetar el orden del bruto.");
  assert.ok(
    (scene.end - scene.start) / seconds <= 1.35,
    `La escena ${scene.name} requiere acelerar más de 1.35×.`,
  );

  const timestamps = sourceTimestamps.filter((time) => time >= scene.start && time < scene.end);
  assert.ok(timestamps.length >= 2, `La escena ${scene.name} no tiene suficientes frames reales.`);
  const first = timestamps[0];
  const last = timestamps.at(-1);
  // Map the first and last real frames onto the first and last target timestamps.
  // This accounts for source-frame alignment without appending frozen frames.
  const timeScale = (frames - 1) / fps / (last - first);
  const speed = 1 / timeScale;
  assert.ok(speed <= 1.35, `La escena ${scene.name} requiere acelerar frames reales más de 1.35×.`);
  const dashboard = index === 0 || index === 4;
  // A wide dashboard contains controls at both edges. Keep all text inside the frame.
  const easing = dashboard
    ? `1+0.01*(1-cos(PI*on/${frames - 1}))`
    : `1.05+0.025*(1-cos(PI*on/${frames - 1}))`;
  // Dialog scenes retain their center; dashboard scenes preserve the top-left navigation.
  const zoomX = index >= 1 && index <= 3 ? "iw/2-iw/zoom/2" : "0";
  const zoomY = index >= 1 && index <= 3 ? "ih/2-ih/zoom/2" : "0";
  const filters = [
    `trim=start=${scene.start}:end=${scene.end}`,
    `setpts=(PTS-STARTPTS)*${timeScale.toFixed(12)}`,
    "fps=30:round=near:eof_action=pass",
    `trim=end_frame=${frames}`,
    "setpts=N/(30*TB)",
  ];
  const highlights = (scene.highlights || []).map((highlight) => {
    const box = highlight.box;
    assert.ok(
      box && [box.x, box.y, box.width, box.height, highlight.at, highlight.duration].every(Number.isFinite),
      "Resaltado inválido.",
    );
    assert.ok(
      box.width > 0 && box.height > 0 && highlight.duration > 0,
      "El resaltado debe tener tamaño y duración positivos.",
    );
    const x = Math.max(0, Math.floor(box.x - 6));
    const y = Math.max(0, Math.floor(box.y - 6));
    const width = Math.min(1920 - x, Math.ceil(box.x + box.width + 6) - x);
    const height = Math.min(1080 - y, Math.ceil(box.y + box.height + 6) - y);
    assert.ok(width > 0 && height > 0, "El resaltado está fuera del viewport.");
    const start = Math.max(0, (scene.start + highlight.at - first) * timeScale);
    const end = Math.min(seconds, start + highlight.duration * timeScale);
    assert.ok(end > start, "El resaltado queda fuera de su escena.");
    filters.push(
      `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=0x191B1E@0.55:t=2:enable='between(t,${start.toFixed(6)},${end.toFixed(6)})'`,
    );
    return { start, end, box: { x, y, width, height }, source: highlight };
  });
  filters.push(
    "scale=3840:2160:flags=lanczos",
    `zoompan=z='${easing}':x='${zoomX}':y='${zoomY}':d=1:s=1920x1080:fps=30`,
  );
  if (labels[index]) {
    filters.push(
      `drawtext=fontfile='${fontArg}':text='${labels[index]}':fontcolor=white:fontsize=28:x=98:y=h-150:box=1:boxcolor=0x191B1E@0.90:boxborderw=18`,
    );
  }
  // A boundary consists of a 0.15 s fade-out and 0.15 s fade-in (0.30 s total).
  // Fades remain inside each exact scene duration and never repeat source frames.
  if (index > 0) filters.push("fade=t=in:st=0:d=0.15");
  const fadeDuration = index === frameCounts.length - 1 ? 0.25 : 0.15;
  filters.push(`fade=t=out:st=${(seconds - fadeDuration).toFixed(6)}:d=${fadeDuration}`);
  const output = path.join(renderDir, `scene-${String(index + 1).padStart(2, "0")}.mp4`);
  console.log(`Render ${index + 1}/5: ${scene.name}; ${frames} frames; velocidad ${speed.toFixed(3)}×.`);
  await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-i",
    sourcePath,
    "-vf",
    filters.join(","),
    "-frames:v",
    String(frames),
    "-r",
    "30",
    "-fps_mode",
    "cfr",
    "-c:v",
    "libx264",
    "-crf",
    "17",
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    output,
  ]);
  const segment = await probe(output);
  const segmentVideo = segment.streams.find((stream) => stream.codec_type === "video");
  assert.equal(Number(segmentVideo.nb_read_frames), frames, `Faltan frames en ${scene.name}.`);
  assert.ok(
    Math.abs(Number(segment.format.duration) - seconds) < 0.000001,
    `Duración inválida de ${scene.name}.`,
  );
  renderedScenes.push(output);
  sceneReports.push({
    name: scene.name,
    sourceStart: scene.start,
    sourceEnd: scene.end,
    firstSourceFrame: first,
    lastSourceFrame: last,
    sourceFrames: timestamps.length,
    speed,
    seconds,
    frames,
    zoom: dashboard ? [1, 1.02] : [1.05, 1.1],
    anchor: index >= 1 && index <= 3 ? "center" : "top-left",
    label: labels[index],
    highlights,
    fadeInSeconds: index > 0 ? 0.15 : 0,
    fadeOutSeconds: fadeDuration,
  });
}

const concatFile = path.join(renderDir, "concat.txt");
await writeFile(
  concatFile,
  renderedScenes.map((filename) => `file '${concatPath(filename)}'`).join("\n") + "\n",
  "utf8",
);
console.log("Montaje final y validación de 900 timestamps.");
await run(ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "warning",
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  concatFile,
  "-c:v",
  "copy",
  "-an",
  "-frames:v",
  "900",
  "-movflags",
  "+faststart",
  finalPath,
]);
const final = await probe(finalPath, true);
assert.equal(final.streams.length, 1, "El video debe tener una única pista de video, sin audio.");
const video = final.streams[0];
assert.equal(video.codec_type, "video");
assert.equal(video.codec_name, "h264");
assert.equal(video.width, 1920);
assert.equal(video.height, 1080);
assert.equal(video.pix_fmt, "yuv420p");
assert.equal(video.r_frame_rate, "30/1");
assert.equal(video.avg_frame_rate, "30/1");
assert.equal(Number(video.nb_read_frames), 900);
assert.equal(final.frames.length, 900);
assert.ok(Math.abs(Number(video.duration) - 30) < 0.000001, "La pista no dura exactamente 30 segundos.");
assert.ok(
  Math.abs(Number(final.format.duration) - 30) < 0.000001,
  "El contenedor no dura exactamente 30 segundos.",
);
const timestamps = final.frames.map((frame) => Number(frame.best_effort_timestamp_time));
const errors = timestamps.map((time, index) => Math.abs(time - index / fps));
assert.ok(
  errors.every((error) => error <= 0.000002),
  "El video final presenta timestamps fuera de 30 FPS constantes.",
);
const deltas = timestamps.slice(1).map((time, index) => time - timestamps[index]);
const bytes = await readFile(finalPath);
const atoms = [];
for (let offset = 0; offset + 8 <= bytes.length; ) {
  const size = bytes.readUInt32BE(offset);
  const type = bytes.toString("ascii", offset + 4, offset + 8);
  assert.ok(size >= 8 && offset + size <= bytes.length, "Estructura MP4 inválida.");
  atoms.push({ type, offset, size });
  offset += size;
}
assert.ok(
  atoms.find((atom) => atom.type === "moov")?.offset < atoms.find((atom) => atom.type === "mdat")?.offset,
  "El MP4 no tiene metadatos antes de los datos: falta faststart.",
);

// Check the complete encoded video, rather than checking only sampled frames.
await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", finalPath, "-f", "null", "-"]);
const sampleFrames = [45, 195, 405, 630, 825];
const select = sampleFrames.map((frame) => `eq(n,${frame})`).join("+");
await run(ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "warning",
  "-y",
  "-i",
  finalPath,
  "-vf",
  `select='${select}'`,
  "-fps_mode",
  "vfr",
  "-frames:v",
  "5",
  path.join(qaDir, "sample-%02d.png"),
]);
const interactionFrames = [131, 343, 570];
await run(ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "warning",
  "-y",
  "-i",
  finalPath,
  "-vf",
  `select='${interactionFrames.map((frame) => `eq(n,${frame})`).join("+")}'`,
  "-fps_mode",
  "vfr",
  "-frames:v",
  "3",
  path.join(qaDir, "interaction-%02d.png"),
]);
const contactFrames = [0, 45, 89, 90, 195, 299, 300, 405, 509, 510, 630, 749, 750, 825, 891];
await run(ffmpeg, [
  "-hide_banner",
  "-loglevel",
  "warning",
  "-y",
  "-i",
  finalPath,
  "-vf",
  `select='${contactFrames.map((frame) => `eq(n,${frame})`).join("+")}',scale=384:216:flags=lanczos,tile=5x3`,
  "-frames:v",
  "1",
  "-update",
  "1",
  path.join(qaDir, "contact-sheet.png"),
]);
final.validation = {
  passed: true,
  constantFrameRate: true,
  expectedFrames: 900,
  expectedDurationSeconds: 30,
  maxTimestampErrorSeconds: Math.max(...errors),
  minFrameDeltaSeconds: Math.min(...deltas),
  maxFrameDeltaSeconds: Math.max(...deltas),
  fullDecodePassed: true,
  silent: true,
  faststart: true,
  mp4Atoms: atoms,
  pixelFormat: "yuv420p",
  sourcePreserved: shots.source,
  transitions: "0.15 s fade-out + 0.15 s fade-in inside scene limits; final fade-out 0.25 s",
  sampleFrames,
  interactionFrames,
  contactFrames,
  scenes: sceneReports,
};
await writeFile(path.join(qaDir, "ffprobe.json"), JSON.stringify(final, null, 2) + "\n", "utf8");
console.log(`Video validado: ${finalPath} (1920×1080, H.264, 30 FPS CFR, 900 frames, 30.000 s, sin audio).`);
