import { readFileSync } from "node:fs";

const line = readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("GEMINI_API_KEY="));

if (!line) {
  console.log("NO_GEMINI_KEY");
  process.exit(1);
}

const key = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");

const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
const payload = {
  systemInstruction: {
    parts: [{ text: "Respondé solo con JSON válido." }],
  },
  contents: [{ role: "user", parts: [{ text: 'Devolvé {"ok": true, "modelo": "gemini"}' }] }],
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 200,
    responseMimeType: "application/json",
  },
};

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  console.log("STATUS:", res.status);
  console.log("BODY:", body.slice(0, 600));
} catch (e) {
  console.log("ERROR:", e.message);
}
