import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

assert.equal(
  process.platform,
  "win32",
  "Este instalador portátil está preparado para Windows x64.",
);
assert.equal(process.arch, "x64");
const dir = fileURLToPath(new URL("../.tools/", import.meta.url));
await mkdir(dir, { recursive: true });
const filename = "ffmpeg-9.0.2-essentials_build.zip";
const url = `https://www.gyan.dev/ffmpeg/builds/packages/${filename}`;
const zip = path.join(dir, filename);
const hash = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";
if (!existsSync(zip)) {
  console.log(
    "Descargando FFmpeg portátil, sin instalar servicios ni modificar PATH...",
  );
  const response = await fetch(url);
  assert.ok(response.ok, `Descarga HTTP ${response.status}`);
  await writeFile(zip, Buffer.from(await response.arrayBuffer()));
}
const digest = createHash("sha256");
for await (const chunk of createReadStream(zip)) digest.update(chunk);
assert.equal(
  digest.digest("hex"),
  hash,
  "El ZIP no coincide con el SHA256 publicado; no se ejecutará.",
);
const unpacked = path.join(dir, "unpacked");
const bin = path.join(unpacked, "ffmpeg-9.0.2-essentials_build", "bin");
if (!existsSync(path.join(bin, "ffmpeg.exe"))) {
  // Arguments are carried as environment data, never interpolated into shell code.
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:DEMO_FFMPEG_ZIP -DestinationPath $env:DEMO_FFMPEG_UNPACK -Force",
    ],
    {
      env: {
        ...process.env,
        DEMO_FFMPEG_ZIP: zip,
        DEMO_FFMPEG_UNPACK: unpacked,
      },
      windowsHide: true,
      stdio: "inherit",
    },
  );
  assert.equal(result.status, 0, "No se pudo extraer FFmpeg.");
}
for (const name of ["ffmpeg.exe", "ffprobe.exe"])
  await copyFile(path.join(bin, name), path.join(dir, name));
// Playwright 1.62.1 needs registry1011 and a VP8 encoder. The bundled1013 only has VP9.
const shim = path.join(dir, "playwright", "ffmpeg-1011");
await mkdir(shim, { recursive: true });
await copyFile(
  path.join(dir, "ffmpeg.exe"),
  path.join(shim, "ffmpeg-win64.exe"),
);
await writeFile(
  path.join(dir, "download-info.json"),
  JSON.stringify(
    {
      url,
      sha256: hash,
      package: filename,
      providerLinkedBy: "https://ffmpeg.org/download.html",
      playwright: "1.62.1",
      registry: "ffmpeg-1011",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "FFmpeg y FFprobe listos. La descarga, los ejecutables y los estados locales quedan excluidos de Git.",
);
