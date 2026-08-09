// Narración TTS con Microsoft Edge (sin API key) + generación de subtítulos
// ASS con karaoke palabra-por-palabra para YouTube Shorts (1080×1920).
// Solo servidor.
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EdgeTTS } from "edge-tts-universal";

const EDGE_VOICE = "es-AR-TomasNeural";
const EDGE_RATE = "+8%";
const EDGE_PITCH = "-2Hz";

export interface TtsWordBoundary {
  offset: number;
  duration: number;
  text: string;
}

export interface TtsResult {
  audioBytes: Uint8Array;
  words: TtsWordBoundary[];
  durationMs: number;
}

export interface SegmentResult {
  audioBytes: Uint8Array;
  words: TtsWordBoundary[];
}

export interface AssStyle {
  name: string;
  fontName: string;
  fontSize: number;
  primaryColour: string;
  secondaryColour: string;
  outlineColour: string;
  backColour: string;
  bold: number;
  italic: number;
  underline: number;
  strikeOut: number;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
  encoding: number;
}

export const ASS_STYLE: AssStyle = {
  name: "Karaoke",
  fontName: "Arial",
  fontSize: 22,
  primaryColour: "&H00FFFFFF",
  secondaryColour: "&H000000FF",
  outlineColour: "&H00000000",
  backColour: "&H80000000",
  bold: -1,
  italic: 0,
  underline: 0,
  strikeOut: 0,
  scaleX: 100,
  scaleY: 100,
  spacing: 0,
  angle: 0,
  borderStyle: 1,
  outline: 3,
  shadow: 2,
  alignment: 2,
  marginL: 20,
  marginR: 20,
  marginV: 120,
  encoding: 1,
};

function assColor(abgr: string): string {
  return abgr;
}

function assDecimal(style: AssStyle): string {
  const s = style;
  return [
    `Style: ${s.name},${s.fontName},${s.fontSize},${s.primaryColour},${s.secondaryColour},${s.outlineColour},${s.backColour},${s.bold},${s.italic},${s.underline},${s.strikeOut},${s.scaleX},${s.scaleY},${s.spacing},${s.angle},${s.borderStyle},${s.outline},${s.shadow},${s.alignment},${s.marginL},${s.marginR},${s.marginV},${s.encoding}`,
  ].join("\n");
}

function escapeAss(text: string): string {
  return text.replace(/\{/g, "｛").replace(/\}/g, "｝").replace(/\n/g, "\\N");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatAssTime(centiseconds: number): string {
  const totalSeconds = centiseconds / 100;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const cs = Math.floor(totalSeconds * 100) % 100;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

function buildKaraokeLine(startCs: number, words: TtsWordBoundary[]): string {
  if (words.length === 0) return "";

  let accumCs = 0;
  const parts: string[] = [];

  for (const w of words) {
    const wStartCs = Math.round(w.offset / 10_000);
    const wDurCs = Math.max(1, Math.round(w.duration / 10_000));

    if (wStartCs > startCs + accumCs) {
      const gapCs = wStartCs - startCs - accumCs;
      accumCs += gapCs;
    }

    parts.push(`{\\k${wDurCs}}${escapeAss(w.text)}`);
    accumCs += wDurCs;
  }

  return parts.join(" ");
}

export function buildAssFile(
  segments: Array<{ startSec: number; words: TtsWordBoundary[] }>,
  style: AssStyle = ASS_STYLE,
): string {
  const header = [
    `[Script Info]`,
    `ScriptType: v4.00+`,
    `PlayResY: 1920`,
    `PlayResX: 1080`,
    `Timer: 100.0000`,
    ``,
    `[V4+ Styles]`,
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding`,
    assDecimal(style),
    ``,
    `[Events]`,
    `Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`,
  ].join("\n");

  const events: string[] = [];

  for (const seg of segments) {
    if (seg.words.length === 0) continue;

    const startCs = Math.round(seg.startSec * 100);
    const lastWord = seg.words[seg.words.length - 1]!;
    const endCs = Math.round((lastWord.offset + lastWord.duration) / 10_000);
    const karaokeText = buildKaraokeLine(startCs, seg.words);

    events.push(
      `Dialogue: 0,${formatAssTime(startCs)},${formatAssTime(endCs)},${style.name},,0,0,0,,${karaokeText}`,
    );
  }

  return `${header}\n${events.join("\n")}\n`;
}

async function synthesizeSegment(
  text: string,
  voice: string = EDGE_VOICE,
  rate: string = EDGE_RATE,
  pitch: string = EDGE_PITCH,
): Promise<SegmentResult> {
  const tts = new EdgeTTS(text, voice, { rate, pitch });

  try {
    const result = await tts.synthesize();
    const audioBytes = Buffer.from(await result.audio.arrayBuffer());
    const rawWords = (result.subtitle as unknown as Array<Record<string, unknown>>)
      .map((s) => ({
        offset: Number((s as Record<string, unknown>)["offset"] ?? 0),
        duration: Number((s as Record<string, unknown>)["duration"] ?? 0),
        text: String((s as Record<string, unknown>)["text"] ?? ""),
      }))
      .filter((w) => w.text.trim().length > 0);

    return { audioBytes: new Uint8Array(audioBytes), words: rawWords };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[captions] Error TTS segmento: ${msg}`);
    return { audioBytes: new Uint8Array(Buffer.alloc(0)), words: [] };
  }
}

export async function synthesizeSegments(
  segments: Array<{ text: string; startSec: number }>,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ audioBytes: Uint8Array; words: TtsWordBoundary[]; startSec: number }>> {
  const results: Array<{ audioBytes: Uint8Array; words: TtsWordBoundary[]; startSec: number }> = [];
  const total = segments.length;

  for (let i = 0; i < total; i++) {
    const seg = segments[i]!;
    const result = await synthesizeSegment(seg.text);
    results.push({ ...result, startSec: seg.startSec });
    onProgress?.(i + 1, total);
  }

  return results;
}

export async function synthesizeNarration(
  text: string,
  onProgress?: (done: number, total: number) => void,
): Promise<TtsResult> {
  const MAX_CHARS = 3_000;
  const subTexts: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHARS) {
      subTexts.push(remaining);
      break;
    }
    let cutAt = remaining.lastIndexOf(". ", MAX_CHARS);
    if (cutAt < MAX_CHARS * 0.5) cutAt = remaining.lastIndexOf(" ", MAX_CHARS);
    if (cutAt <= 0) cutAt = MAX_CHARS;
    subTexts.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  const segments = subTexts.map((t, i) => ({ text: t, startSec: 0 }));
  const results = await synthesizeSegments(segments, onProgress);

  const allWords: TtsWordBoundary[] = [];
  let totalBytes = 0;
  let cumulativeOffset = 0;

  for (const r of results) {
    totalBytes += r.audioBytes.length;
    const shifted = r.words.map((w) => ({
      offset: w.offset + cumulativeOffset,
      duration: w.duration,
      text: w.text,
    }));
    allWords.push(...shifted);
    cumulativeOffset += shifted.reduce((sum, w) => sum + w.duration, 0);
  }

  return {
    audioBytes: new Uint8Array(
      totalBytes > 0 ? Buffer.concat(results.map((r) => r.audioBytes)) : Buffer.alloc(0),
    ),
    words: allWords,
    durationMs: Math.round(cumulativeOffset / 10),
  };
}

export async function buildAssFromGuion(
  guion: Array<{
    desde_seg: number;
    hasta_seg: number;
    voz_en_off: string;
    texto_en_pantalla: string;
  }>,
  style: AssStyle = ASS_STYLE,
): Promise<string> {
  const segments = guion
    .filter(
      (g) => (g.voz_en_off || g.texto_en_pantalla) && Number(g.hasta_seg) > Number(g.desde_seg),
    )
    .map((g) => ({
      text: String(g.voz_en_off || g.texto_en_pantalla).trim(),
      startSec: Number(g.desde_seg),
    }))
    .filter((s) => s.text.length > 0);

  if (segments.length === 0) {
    return buildAssFile([], style);
  }

  const results = await synthesizeSegments(segments);
  const mapped = results.map((r, i) => ({
    startSec: segments[i]!.startSec,
    words: r.words,
  }));

  return buildAssFile(mapped, style);
}
