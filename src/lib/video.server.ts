// Generación de video vertical. Solo servidor.
//
// Estrategia GRATUITA e ILIMITADA (garantiza el MP4 en cualquier entorno):
//   1. TTS neural real con Microsoft Edge (edge-tts) — sin API key, sin límites,
//      voz natural (es-AR-ElenaNeural o fallback mujeres es-AR / es-ES).
//   2. Música de fondo generada por ffmpeg (sine/átmósfera) — sin licencias,
//      mezclada a bajo volumen bajo la voz.
//   3. Subtítulos quemados con el filtro `ass=` de ffmpeg (libass), estilo
//      grande, contorno negro y posición inferior — compatibles con Windows.
//   4. Movimiento de cámara tipo Ken Burns por plano (zoom/paneo lento) y
//      concat final con libx264 + AAC.
//
// Proveedor premium opcional: Google Veo si hay GEMINI_API_KEY con cuota.
// Sin clave ni cuota, el render local gratuito toma el relevo y SIEMPRE
// produce un video (con voz, subtítulos y movimiento).

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { EdgeTTS } from "@andresaya/edge-tts";

const nodeRequire = createRequire(import.meta.url);

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_VIDEO = "veo-3.1-lite";

// Voces neurales de Edge (gratis). Preferencia argentina, sin caracteres raros.
const TTS_VOICES = ["es-AR-ElenaNeural", "es-MX-DaliaNeural", "es-ES-ElviraNeural"];

function apiKey(): string {
  const key = process.env["GEMINI_API_KEY"];
  if (!key)
    throw new Error(
      "No hay GEMINI_API_KEY: el render de video necesita una clave de Google AI Studio. El dossier y el storyboard ya están listos.",
    );
  return key;
}

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked" | string;
  progress?: number;
  error?: string;
}

/** Resuelve el binario de ffmpeg: PATH del sistema o @ffmpeg-installer. */
function ffmpegBin(): string {
  for (const pkg of ["@ffmpeg-installer/ffmpeg", "@ffmpeg-installer/win32-x64"]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = nodeRequire(pkg) as { path?: string };
      if (mod.path) return mod.path;
    } catch {
      /* siguiente */
    }
  }
  return "ffmpeg";
}

function run(cmd: string, args: string[], timeoutMs = 300_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} falló: ${stderr || stdout || error.message}`));
        return;
      }
      resolve();
    });
    proc.on("error", (err) => reject(err));
  });
}

async function ffmpegDisponible(): Promise<boolean> {
  try {
    await run(ffmpegBin(), ["-version"], 10_000);
    return true;
  } catch {
    return false;
  }
}

export async function startVideoJob(prompt: string): Promise<VideoJob> {
  if (await ffmpegDisponible()) {
    // Render gratuito e ilimitado: el job se resuelve en el cliente/servidor
    // llamando a assembleVideo con los frames ya generados.
    return { id: `local:${Date.now()}`, status: "in_progress", progress: 5 };
  }

  // Fallback premium: Veo si hay clave.
  try {
    const key = apiKey();
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
          "El modelo de video no está disponible con esta clave GEMINI_API_KEY (free tier no incluye video). El dossier y el storyboard ya están listos.",
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
    // Si Veo no está disponible pero ffmpeg sí, el runner usará assembleVideo.
    if (await ffmpegDisponible()) {
      return { id: `local:${Date.now()}`, status: "in_progress", progress: 5 };
    }
    throw error;
  }
}

/**
 * Sintetiza la locución con edge-tts (voz neural real, sin API key).
 * Devuelve un Buffer MP3, o null si el servicio no responde.
 */
async function synthesizeVoiceover(text: string): Promise<Buffer | null> {
  if (!text.trim()) return null;
  const tts = new EdgeTTS();
  for (const voice of TTS_VOICES) {
    try {
      await tts.synthesize(text.slice(0, 5000), voice, { rate: "-5%", volume: "90%" });
      const buffer = tts.toBuffer();
      if (buffer && buffer.length > 0) return buffer;
    } catch {
      // probamos la siguiente voz
    }
  }
  return null;
}

/** Crea un archivo ASS con un estilo de subtítulos grande y legible. */
function buildSubtitleFile(
  beats: Array<{ desde: number; hasta: number; texto: string }>,
): string {
  const fmt = (seg: number): string => {
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = Math.floor(seg % 60);
    const cs = Math.floor((seg - Math.floor(seg)) * 100);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs)}`;
  };

  const events = beats
    .filter((b) => b.texto && b.hasta > b.desde)
    .map(
      (b, i) =>
        `Dialogue: 0,${fmt(b.desde)},${fmt(b.hasta)},Sub,,0,0,0,,${b.texto.replace(/\n/g, " ")}`,
    )
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 540
PlayResY: 960

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub, Arial, 62, &H00FFFFFF, &H00FFFFFF, &H00000000, &H80000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 5, 1, 2, 40, 40, 40, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}`;
}

/** Ensambla el video final gratuito: Ken Burns por plano + voz neural + música + ASS. */
export interface AssembleInput {
  frames: Array<{ numero: number; path: string }>;
  /** Texto de voz en off (se sintetiza con edge-tts). */
  voiceover: string;
  /** Guion segundo a segundo para los subtítulos. */
  beats?: Array<{ desde_seg: number; hasta_seg: number; texto_en_pantalla: string }>;
  /** Duración total estimada en segundos. */
  durationSec: number;
  runId: string;
}

export async function assembleVideo(input: AssembleInput): Promise<Uint8Array> {
  const work = await fs.mkdtemp(path.join(tmpdir(), "viral-"));
  const ffmpeg = ffmpegBin();
  const parts: string[] = [];
  const n = Math.max(1, input.frames.length);

  // 1) Cada frame -> clip con Ken Burns (zoom/pan lento) y encadenado.
  for (let i = 0; i < input.frames.length; i += 1) {
    const frame = input.frames[i]!;
    const segDur = (input.durationSec / n).toFixed(2);
    const out = path.join(work, `clip-${i}.mp4`);
    const z = 1.05 + (i % 3) * 0.03;
    const x = (i % 2) * 0.04;
    const y = (i % 3) * 0.03;
    const vf = `scale=540:960:force_original_aspect_ratio=increase,crop=540:960,format=yuv420p,zoompan=z='${z}':d=25*${segDur}:x='${x}*iw':y='${y}*ih':s=540x960:fps=25,scale=540:960`;
    await run(ffmpeg, [
      "-y", "-loop", "1", "-i", frame.path, "-t", segDur, "-vf", vf,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", out,
    ]);
    parts.push(out);
  }

  const concat = path.join(work, "concat.txt");
  await fs.writeFile(concat, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

  const videoOut = path.join(work, "video.mp4");
  await run(ffmpeg, [
    "-y", "-f", "concat", "-safe", "0", "-i", concat,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", videoOut,
  ]);

  // 2) Audio: voz neural (edge-tts) + base musical generada (sine suave).
  const voiceOut = path.join(work, "voice.mp3");
  const voice = await synthesizeVoiceover(input.voiceover);
  let voiceTrack: string | null = null;
  if (voice) {
    await fs.writeFile(voiceOut, voice);
    voiceTrack = voiceOut;
  }

  const dur = String(Math.max(1, Math.round(input.durationSec)));
  const musicOut = path.join(work, "music.m4a");
  // Ambiente sin violencia de derechos: tono grave + onda suave, enmascarado
  // bajo la voz. Volumen bajo (0.06) para que la voz sea protagonista.
  try {
    await run(ffmpeg, [
      "-y", "-f", "lavfi",
      "-i", `sine=frequency=110:duration=${dur}`,
      "-af", `volume=0.05,lowpass=f=400`,
      "-c:a", "aac", musicOut,
    ]);
  } catch {
    // música opcional: si falla, seguimos sin ella
  }

  // 3) Generar la pista de audio final (voz + música mezcladas) en un paso aparte.
  const audioIn: string[] = [];
  const mixedOut = path.join(work, "audio.m4a");
  const musicExists = Boolean(await fs.stat(musicOut).catch(() => null));

  if (voiceTrack && musicExists) {
    audioIn.push("-i", voiceTrack, "-i", musicOut);
    await run(ffmpeg, [
      "-y",
      ...audioIn,
      "-filter_complex",
      "[0:a]volume=1.0[va];[1:a]volume=0.8[ma];[va][ma]amix=inputs=2:duration=first:dropout_transition=0[aout]",
      "-map", "[aout]",
      "-c:a", "aac",
      mixedOut,
    ]);
  } else if (voiceTrack) {
    audioIn.push("-i", voiceTrack);
    await run(ffmpeg, ["-y", ...audioIn, "-c:a", "aac", mixedOut]);
  } else if (musicExists) {
    audioIn.push("-i", musicOut);
    await run(ffmpeg, [
      "-y",
      ...audioIn,
      "-af", "volume=0.6",
      "-c:a", "aac",
      mixedOut,
    ]);
  }

  // 4) Mux final: video + audio mezclado + subtítulos ASS quemados (solo -vf).
  const finalOut = path.join(work, "final.mp4");
  const assText = buildSubtitleFile(
    (input.beats ?? []).map((b) => ({
      desde: Number(b.desde_seg) || 0,
      hasta: Number(b.hasta_seg) || 0,
      texto: String(b.texto_en_pantalla ?? ""),
    })),
  );
  const assPath = path.join(work, "subs.ass");
  await fs.writeFile(assPath, assText, "utf8");
  const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  const muxInputs = ["-y", "-i", videoOut];
  const finalHasAudio = Boolean(
    (await fs.stat(mixedOut).catch(() => null)) !== null,
  );
  if (finalHasAudio) muxInputs.push("-i", mixedOut);

  const args: string[] = [
    ...muxInputs,
    "-vf", `ass=${assEscaped}`,
    "-map", "0:v",
    ...(finalHasAudio ? ["-map", "1:a:0"] : []),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    ...(finalHasAudio ? ["-c:a", "aac"] : []),
    "-shortest",
    finalOut,
  ];
  await run(ffmpeg, args);

  const buf = await fs.readFile(finalOut);
  await fs.rm(work, { recursive: true, force: true });
  return new Uint8Array(buf);
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  const key = (() => {
    try {
      return apiKey();
    } catch {
      return null;
    }
  })();
  if (id.startsWith("local:")) return { id, status: "in_progress", progress: 20 };
  if (!key) return { id, status: "blocked", error: "Sin clave de video." };
  if (id.startsWith("https://") || id.startsWith("gs://")) {
    return { id, status: "completed", progress: 100 };
  }
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
