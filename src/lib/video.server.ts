// Generación de video vertical. Solo servidor.
//
// Estrategia principal: render local gratuito e ilimitado con ffmpeg ensamblando
// storyboard (frames Pollinations) + TTS Edge (narración voz argentina) +
// subtítulos animados ASS karaoke palabra-por-palabra + música con sidechain.
//
// Fallback premium: Google Veo si hay GEMINI_API_KEY.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { synthesizeNarration, buildAssFromGuion, ASS_STYLE } from "./captions.server";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_VIDEO = "veo-3.1-lite";

// ---------------------------------------------------------------------------
// Resolución YouTube Shorts 9:16 Full HD
// ---------------------------------------------------------------------------
const W = 1080;
const H = 1920;
const FPS = 30;

// ---------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------

function run(
  cmd: string,
  args: string[],
  timeoutMs = 300_000,
  opts?: { cwd?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      cmd,
      args,
      { timeout: timeoutMs, cwd: opts?.cwd },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${cmd} falló: ${stderr || stdout || error.message}`));
          return;
        }
        resolve();
      },
    );
    proc.on("error", (err) => reject(err));
  });
}

async function ffmpegDisponible(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** Escapa una ruta de archivo para usarla en filtros de ffmpeg (Windows-safe). */
function escRutaFiltro(ruta: string): string {
  return ruta.replace(/\\/g, "/").replace(/'/g, "%27");
}

// ---------------------------------------------------------------------------
// Generación de clips individuales con Ken Burns animado
// ---------------------------------------------------------------------------

async function renderClip(
  framePath: string,
  outPath: string,
  durSec: number,
  zVal: string,
  cropX: string,
  cropY: string,
): Promise<void> {
  const vf =
    `scale=${W}:${H}:force_original_aspect_ratio=increase,` +
    `crop=${W}:${H}:${cropX}:${cropY},` +
    `format=yuv420p,` +
    `zoompan=z='${zVal}':x='0':y='0':` +
    `d=1:s=${W}x${H}:fps=${FPS},` +
    `scale=${W}:${H}`;

  await run("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-i",
    framePath,
    "-t",
    String(durSec),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "ultrafast",
    "-crf",
    "18",
    "-r",
    String(FPS),
    outPath,
  ]);
}

// ---------------------------------------------------------------------------
// Ensamblado final con audio y subtítulos
// ---------------------------------------------------------------------------

async function mixAudio(
  workDir: string,
  concatList: string[],
  assPath: string | undefined,
  durationSec: number,
  musicPath?: string,
): Promise<string> {
  const concatFile = path.join(workDir, "concat.txt");
  await fs.writeFile(
    concatFile,
    concatList.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );

  const mergedVideo = path.join(workDir, "merged.mp4");
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatFile,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-r",
    String(FPS),
    mergedVideo,
  ]);

  const voiceAudio = path.join(workDir, "voice_raw.aac");
  if (concatList.length > 0) {
    await run("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFile,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-ac",
      "2",
      voiceAudio,
    ]);
  } else {
    await run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=44100:cl=stereo:d=${durationSec}`,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      voiceAudio,
    ]);
  }

  const numAudioInputs = musicPath ? 2 : 1;

  const sidechainFilter = musicPath
    ? `[0:a][1:a]sidechaincompress=threshold=0.05:ratio=20:attack=50:release=500[voice];[voice]anull[outa]`
    : "[0:a]anull[outa]";

  const mixedAudio = path.join(workDir, "mixed.aac");
  await run("ffmpeg", [
    "-y",
    "-i",
    voiceAudio,
    ...(musicPath ? ["-i", musicPath] : []),
    "-filter_complex",
    sidechainFilter,
    "-map",
    "[outa]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-ac",
    "2",
    mixedAudio,
  ]);

  const normalizedAudio = path.join(workDir, "normalized.aac");
  await run("ffmpeg", [
    "-y",
    "-i",
    mixedAudio,
    "-af",
    "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    normalizedAudio,
  ]);

  const assFilter =
    assPath && assPath.trim().length > 0 ? `[0:v]ass=subs.ass[vout]` : "[0:v]copy[vout]";

  const args: string[] = ["-y"];
  args.push("-i", mergedVideo);
  args.push("-i", normalizedAudio);

  if (assPath && assPath.trim().length > 0) {
    args.push("-filter_complex", "[0:v]ass=subs.ass[vout]");
    args.push("-map", "[vout]", "-map", "1:a");
  } else {
    args.push("-map", "0:v", "-map", "1:a");
  }

  const finalOut = path.join(workDir, "final.mp4");
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-shortest",
    finalOut,
  );

  await run("ffmpeg", args, undefined, { cwd: workDir });

  return finalOut;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked" | string;
  progress?: number;
  error?: string;
}

export interface AssembleInput {
  frames: Array<{ numero: number; path: string }>;
  voiceover: string;
  subtitles?: string;
  durationSec: number;
  runId: string;
  musicPath?: string;
}

export async function assembleVideo(input: AssembleInput): Promise<Uint8Array> {
  const work = await fs.mkdtemp(path.join(tmpdir(), "viral-"));
  const clips: string[] = [];

  const frameCount = input.frames.length;
  if (frameCount === 0) throw new Error("Sin frames para ensamblar.");

  const totalDur = input.durationSec;
  const baseDur = totalDur / frameCount;
  const crossfadeDur = 0.6;
  const segDur = baseDur + crossfadeDur;

  const zVals = ["1.08", "1.0"];
  const cropXs = ["-43", "0"];
  const cropYs = ["-192", "0"];

  for (let i = 0; i < frameCount; i++) {
    const frame = input.frames[i]!;
    const out = path.join(work, `clip-${i}.mp4`);
    const idx = i % 2;
    const zVal = zVals[idx]!;
    const cropX = cropXs[idx]!;
    const cropY = cropYs[idx]!;

    await renderClip(frame.path, out, segDur, zVal, cropX, cropY);
    clips.push(out);
  }

  const assPath =
    input.subtitles && input.subtitles.trim().length > 0 ? path.join(work, "subs.ass") : undefined;

  if (assPath && input.subtitles) {
    await fs.copyFile(input.subtitles, assPath);
  }

  let finalPath: string;
  try {
    finalPath = await mixAudio(work, clips, assPath, totalDur, input.musicPath);
  } catch (audioErr) {
    console.warn(`[video] Audio mixing falló, usando video sin audio: ${audioErr}`);
    finalPath = await mixAudio(work, clips, undefined, totalDur);
  }

  const buf = await fs.readFile(finalPath);
  await fs.rm(work, { recursive: true, force: true });
  return new Uint8Array(buf);
}

export async function startVideoJob(prompt: string): Promise<VideoJob> {
  if (await ffmpegDisponible()) {
    return { id: `local:${Date.now()}`, status: "queued", progress: 0 };
  }

  const key = process.env["GEMINI_API_KEY"];
  if (!key) {
    throw new Error(
      "No hay ffmpeg ni GEMINI_API_KEY: no se puede renderizar video. Instalá ffmpeg para usar el render local gratuito.",
    );
  }

  try {
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt.slice(0, 4000) }] }],
      generationConfig: { aspectRatio: "9:16", durationSeconds: "8" },
    };
    const url = `${GEMINI_BASE}/models/${MODEL_VIDEO}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        throw new Error(
          "El modelo de video no está disponible con esta clave (free tier no incluye video). Instalá ffmpeg para render local gratuito.",
        );
      }
      throw new Error(`Servicio de video [${response.status}]: ${body.slice(0, 400)}`);
    }
    const data = JSON.parse(body) as {
      name?: string;
      candidates?: Array<{ content?: { parts?: Array<{ fileData?: { fileUri?: string } }> } }>;
      error?: { message?: string };
    };
    if (data.error?.message) throw new Error(`Servicio de video: ${data.error.message}`);
    const id = data.name ?? data.candidates?.[0]?.content?.parts?.[0]?.fileData?.fileUri;
    if (!id) throw new Error("El proveedor no devolvió un identificador de video.");
    return { id, status: "in_progress", progress: 10 };
  } catch (error) {
    if (await ffmpegDisponible()) {
      return { id: `local:${Date.now()}`, status: "queued", progress: 0 };
    }
    throw error;
  }
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  const key = process.env["GEMINI_API_KEY"];
  if (id.startsWith("local:")) return { id, status: "queued", progress: 10 };
  if (!key) return { id, status: "blocked", error: "Sin clave de video premium." };

  const url = `${GEMINI_BASE}/${id}?key=${key}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Estado de video [${response.status}]: ${body.slice(0, 400)}`);
  const data = JSON.parse(body) as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      candidates?: Array<{ content?: { parts?: Array<{ fileData?: { fileUri?: string } }> } }>;
    };
  };
  if (data.error?.message) return { id, status: "failed", error: data.error.message };
  if (data.done) {
    const uri = data.response?.candidates?.[0]?.content?.parts?.[0]?.fileData?.fileUri;
    return uri
      ? { id: uri, status: "completed", progress: 100 }
      : { id, status: "failed", error: "El video terminó sin archivo descargable." };
  }
  return { id, status: "in_progress", progress: 60 };
}

export async function downloadVideo(id: string): Promise<Uint8Array> {
  if (!id.startsWith("http")) throw new Error("El video aún no tiene una URL de descarga.");
  const response = await fetch(id, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Descarga de video [${response.status}]`);
  return new Uint8Array(await response.arrayBuffer());
}
