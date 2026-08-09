// Prueba: text.pollinations.ai legacy con modelo "openai" (default)
const tries = [
  { url: "https://text.pollinations.ai/", model: "openai" },
  { url: "https://text.pollinations.ai/", model: "gpt-4o-mini" },
];

for (const t of tries) {
  try {
    const res = await fetch(t.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: t.model,
        messages: [{ role: "user", content: 'Devolvé {"ok": true}' }],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    console.log(t.model, "→", res.status, body.slice(0, 300));
  } catch (e) {
    console.log(t.model, "→ ERR", e.message);
  }
}
