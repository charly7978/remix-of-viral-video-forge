import { EdgeTTS } from "@andresaya/edge-tts";
import { writeFileSync } from "node:fs";

const tts = new EdgeTTS();
try {
  await tts.synthesize(
    "Esto es una prueba de voz neuronal para shorts virales.",
    "es-AR-ElenaNeural",
    { rate: "-5%", volume: "90%" },
  );
  const buffer = tts.toBuffer();
  writeFileSync("tmp-tts-test.mp3", buffer);
  console.log("TTS_OK bytes:", buffer.length);
} catch (e) {
  console.log("TTS_ERROR:", e.message);
}
