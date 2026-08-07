// Cliente del gateway de IA de Lovable. Solo servidor.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Falta LOVABLE_API_KEY en el servidor.");
  return key;
}

type JsonSchema = Record<string, unknown>;

/** Traduce las fallas del gateway a algo accionable para el operador. */
export function gatewayError(status: number, body: string): Error {
  if (status === 402) {
    return new Error(
      "Se agotaron los créditos de IA del espacio de trabajo. Recargá créditos o subí de plan para seguir produciendo.",
    );
  }
  if (status === 429) {
    return new Error("Límite de pedidos alcanzado. Esperá unos minutos y volvé a lanzar la corrida.");
  }
  return new Error(`Servicio de IA [${status}]: ${body.slice(0, 400)}`);
}


interface ReasonArgs {
  system: string;
  prompt: string;
  schemaName: string;
  schema: JsonSchema;
  effort?: "low" | "medium" | "high";
  model?: string;
}

/**
 * Llamada de razonamiento con salida estructurada.
 * Usa streaming: una corrida profunda puede superar los 2 minutos y una
 * respuesta bufferizada se cortaría a mitad de camino.
 */
export async function reason<T>({
  system,
  prompt,
  schemaName,
  schema,
  effort = "medium",
  model = "openai/gpt-5.6-sol",
}: ReasonArgs): Promise<T> {
  const response = await fetch(`${GATEWAY}/responses`, {
    method: "POST",
    headers: {
      "Lovable-API-Key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      reasoning: { effort },
      stream: true,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text();
    throw new Error(`Gateway IA [${response.status}]: ${body.slice(0, 500)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        }
      } catch {
        // fragmento incompleto, se ignora
      }
    }
  }

  if (!text.trim()) throw new Error("El modelo no devolvió contenido.");

  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error("Respuesta del modelo ilegible.");
  }
}

/** Genera un frame de storyboard. Devuelve bytes PNG/JPEG. */
export async function generateFrame(prompt: string): Promise<Uint8Array | null> {
  const response = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      "Lovable-API-Key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gateway imagen [${response.status}]: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;

  const base64 = url.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
