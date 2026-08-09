import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const work = mkdtempSync(path.join(tmpdir(), "ass2-"));
const assPath = path.join(work, "subs.ass");
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 540
PlayResY: 960

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub, Arial, 64, &H00FFFFFF, &H00FFFFFF, &H00000000, &H80000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 1, 2, 40, 40, 40, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Sub,,0,0,0,,HOOK: {\\b1}El 90% falla{\\b0}
`;
writeFileSync(assPath, ass, "utf8");

const forward = assPath.replace(/\\/g, "/");
const escaped = forward.replace(/:/g, "\\:");
const out1 = path.join(work, "out1.mp4");
const out2 = path.join(work, "out2.mp4");

// Variante 1: ass con filename escapado (\:)
try {
  execFileSync(
    "ffmpeg",
    [
      "-y", "-f", "lavfi", "-i", "color=c=0x202020:s=540x960:d=2",
      "-vf", `ass=filename='${escaped}':original_size=540x960`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", "2", out1,
    ],
    { stdio: "pipe", timeout: 30_000 },
  );
  console.log("ASS_ESCAPED_OK");
} catch (e) {
  const stderr = (e.stderr ?? String(e)).toString();
  console.log("ASS_ESCAPED_FAIL:", stderr.split(/\r?\n/).slice(-3).join(" | "));
}

// Variante 2: drawtext (no usa libass ni path externo)
const fontfile = "C\\:/Windows/Fonts/arialbd.ttf";
try {
  execFileSync(
    "ffmpeg",
    [
      "-y", "-f", "lavfi", "-i", "color=c=0x202020:s=540x960:d=2",
      "-vf",
      `drawtext=fontfile='${fontfile}':text='El 90% falla':x=(w-text_w)/2:y=h-220:fontsize=64:fontcolor=white:borderw=4:bordercolor=black:enable='between(t,0,2)'`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", "2", out2,
    ],
    { stdio: "pipe", timeout: 30_000 },
  );
  console.log("DRAWTEXT_OK");
} catch (e) {
  const stderr = (e.stderr ?? String(e)).toString();
  console.log("DRAWTEXT_FAIL:", stderr.split(/\r?\n/).slice(-3).join(" | "));
}
