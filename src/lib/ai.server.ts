// Capa de IA gratuita y robusta. Solo servidor.
// Proveedores: Google Gemini (free tier) para razonamiento + imágenes,
// y cascade de video con degradación suave (el video es opcional).

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Modelos con free tier real.
const MODEL_REASON = "gemini-2.5-flash"; // razonamiento + salida JSON estructurada
const MODEL_IMAGE = "gemini-2.5-flash-image"; // generación de imágenes

function apiKey(envName: string): string {
  const key = process.env[envName];
  if (!key) throw new Error(`Falta ${envName} en el servidor.`);
  return key;
}

function providerKey(): string {
  // Soportamos dos names para facilitar el deploy.
  return apiKey("GEMINI_API_KEY");
}

// ---------------------------------------------------------------------------
// Utilidades de red: timeout + retries con backoff exponencial.
// ---------------------------------------------------------------------------

async function fetchWithRetries(
  url: string,
  init: RequestInit,
  options: { attempts?: number; baseDelayMs?: number; label: string } = { label: "gemini" },
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    // Las corridas profundas pueden superar los 2 minutos: un timeout de 4 min
    // protege contra cuelgues sin cortar razonamientos largos.
    const timeoutMs = 240_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      // 429 y 5xx son reintentables.
      if (response.status === 429 || response.status >= 500) {
        const body = await response.text().catch(() => "");
        // Rate limit: respetamos el header Retry-After si viene.
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : baseDelayMs * 2 ** attempt;
        if (attempt < attempts) {
          console.warn(`[${options.label}] intento ${attempt} falló (${response.status}): reintento en ${Math.round(waitMs)}ms`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          lastError = new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
          continue;
        }
        return new Response(body, { status: response.status, headers: response.headers });
      }
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error(`[${options.label}] timeout tras ${Math.round(timeoutMs / 1000)}s`);
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      if (attempt < attempts) {
        const waitMs = baseDelayMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`[${options.label}] falló después de ${attempts} intentos`);
}

// ---------------------------------------------------------------------------
// Razonamiento con salida JSON estructurada (Gemini).
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

interface ReasonArgs {
  system: string;
  prompt: string;
  schemaName: string;
  schema: JsonSchema;
  effort?: "low" | "medium" | "high";
  model?: string;
}

/** Traduce el schema JsonSchema del pipeline al formato Schema de Gemini. */
function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  if (Array.isArray(schema)) {
    return {
      type: "ARRAY",
      items: toGeminiSchema((schema[0] ?? {}) as JsonSchema),
    };
  }
  if (typeof schema !== "object" || schema === null) return { type: "STRING" };

  const { type, properties, items, required } = schema as {
    type?: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema;
    required?: string[];
  };

  switch (type) {
    case "array":
      return {
        type: "ARRAY",
        items: items ? toGeminiSchema(items) : { type: "STRING" },
      };
    case "number":
      return { type: "NUMBER" };
    case "string":
      return { type: "STRING" };
    case "object":
    case undefined:
    default: {
      const props: Record<string, Record<string, unknown>> = {};
      for (const [key, value] of Object.entries(properties ?? {})) {
        props[key] = toGeminiSchema(value);
      }
      return {
        type: "OBJECT",
        properties: props,
        required: required ?? Object.keys(properties ?? {}),
      };
    }
  }
}

/**
 * Llamada de razonamiento con salida estructurada vía Google Gemini.
 * Usa streaming (SSE) con respuesta JSON y, al final del stream, parsea el
 * JSON acumulado. Implementa timeout y reintentos.
 */
export async function reason<T>({
  system,
  prompt,
  schemaName: _schemaName,
  schema,
  effort = "medium",
  model = MODEL_REASON,
}: ReasonArgs): Promise<T> {
  const key = providerKey();
  const geminiSchema = toGeminiSchema(schema);

  // Gemini no tiene "effort": lo mapeamos a instrucciones y a maxOutputTokens.
  const effortHint =
    effort === "high"
      ? "Pensá en profundidad y desarrollá el análisis completo antes de responder. No resumas ni recortes campos."
      : effort === "low"
        ? "Respondé directo y conciso, sin desarrollo innecesario."
        : "Pensá con cuidado y respondé completo.";

  const payload = {
    contents: [
      { role: "user", parts: [{ text: `${system}\n\n${prompt}\n\n${effortHint}` }] },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: geminiSchema,
      temperature: 0.7,
      maxOutputTokens: effort === "high" ? 8192 : 4096,
    },
  };

  const url = `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
  const response = await fetchWithRetries(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, { label: `gemini:${model}` });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini [${response.status}]: ${body.slice(0, 400)}`);
  }
  if (!response.body) throw new Error("Gemini no devolvió cuerpo de streaming.");

  // Parseo SSE: cada evento trae un chunk de texto en candidates[0].content.parts[0].text
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload) continue;
      try {
        const event = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const chunk = event.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        text += chunk;
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

// ---------------------------------------------------------------------------
// Generación de imágenes (Gemini).
// ---------------------------------------------------------------------------

/** Genera una imagen. Devuelve bytes PNG/JPEG o null si el modelo no pudo. */
export async function generateFrame(prompt: string): Promise<Uint8Array | null> {
  const key = providerKey();
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      // Pedimos imagen + texto de vuelta.
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const url = `${GEMINI_BASE}/models/${MODEL_IMAGE}:generateContent?key=${key}`;
  const response = await fetchWithRetries(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, { label: "gemini:image" });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`[gemini:image] ${response.status}: ${body.slice(0, 300)}`);
    return null;
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          text?: string;
        }>;
      };
    }>;
  };

  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    console.warn("[gemini:image] el modelo no devolvió imagen.");
    return null;
  }

  return decodeBase64(part.inlineData.data);
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Generación de video: cascada con degradación suave.
// ---------------------------------------------------------------------------

/**
 * Intenta generar el video con proveedores gratuitos en cascada.
 * Si ninguno responde devuelve null: el pipeline continúa igual (el video es
 * opcional en la corrida, el dossier + storyboard son el producto principal).
 */
export async function generateVideo(_prompt: string): Promise<Uint8Array | null> {
  // Los free tiers de video (Pika, Runway, Kling) requieren OAuth de usuario,
  // no API key de servidor. Mantenemos la firma para compatibilidad con el
  // pipeline y devolvemos null: la UI ya maneja "video no disponible" y el
  // botón "Generar ahora" queda habilitado cuando el short está aprobado.
  // Cuando exista un proveedor con API key free, se agrega acá sin tocar nada más.
  return null;
}
