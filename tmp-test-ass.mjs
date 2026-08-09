import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const work = mkdtempSync(path.join(tmpdir(), "ass-test-"));
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

const assFilter = assPath.replace(/\\/g, "/");
const out = path.join(work, "out.mp4");

try {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x202020:s=540x960:d=2",
      "-vf",
      `ass=${assFilter}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-t",
      "2",
      out,
    ],
    { stdio: "pipe", timeout: 30_000 },
  );
  console.log("ASS_OK:", out);
} catch (e) {
  const stderr = (e.stderr ?? String(e)).toString();
  const lines = stderr.split(/\r?\n/);
  console.log("ASS_FAIL_TAIL:", lines.slice(-6).join(" | "));
}
