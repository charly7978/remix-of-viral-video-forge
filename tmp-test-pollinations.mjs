// Prueba del endpoint nuevo de Pollinations (gen.pollinations.ai) — anónimo.
const url = "https://gen.pollinations.ai/v1/chat/completions";

const payload = {
  model: "openai",
  messages: [
    { role: "system", content: "Respondé solo con JSON válido." },
    { role: "user", content: 'Devolvé {"ok": true, "modelo": "openai"}' },
  ],
  temperature: 0.7,
  max_tokens: 200,
  response_format: { type: "json_object" },
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
  console.log("BODY:", body.slice(0, 800));
} catch (e) {
  console.log("ERROR:", e.message);
}
