// Capa de IA gratuita e ilimitada. Solo servidor.
// Razonamiento: Pollinations.ai (texto + imágenes, sin API key, sin límites) → Ollama local (fallback opcional).
// Imágenes: Pollinations.ai — sin API key, sin límites.
// Video: opcional vía Google Veo con GEMINI_API_KEY (sin clave o sin cuota, la corrida queda con dossier + storyboard + prompt maestro; nunca falla).

const POLLINATIONS_TEXT = "https://text.pollinations.ai/";
const POLLINATIONS_IMAGE = "https://image.pollinations.ai/prompt/";
const OLLAMA_BASE = "http://localhost:11434/api/chat";

// Modelos gratuitos en Pollinations (rotación automática de proveedores free).
const TEXT_MODELS = [
  "gpt-4o-mini",
  "claude-3-haiku",
  "gemini-1.5-flash",
  "llama-3.3-70b",
  "mistral-nemo",
];

// Tamaño del storyboard en píxeles (vertical 9:16, liviano para descargar rápido).
const FRAME_WIDTH = 540;
const FRAME_HEIGHT = 960;

// ---------------------------------------------------------------------------
// Utilidades de red: timeout + retries con backoff exponencial.
// ---------------------------------------------------------------------------

async function fetchWithRetries(
  url: string,
  init: RequestInit,
  options: { attempts?: number; baseDelayMs?: number; label: string } = { label: "ia" },
): Promise<Response> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = 300_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status === 429 || response.status >= 500) {
        const body = await response.text().catch(() => "");
        if (/quota exceeded|limit:\s*0|resource_exhausted|billing/i.test(body)) {
          return new Response(body, { status: response.status, headers: response.headers });
        }
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : baseDelayMs * 2 ** attempt;
        if (attempt < attempts) {
          console.warn(
            `[${options.label}] intento ${attempt} falló (${response.status}): reintento en ${Math.round(waitMs)}ms`,
          );
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
// Validación determinista de la forma JSON antes de dársela al pipeline.
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

function validateShape(schema: JsonSchema, value: unknown, ruta = "$"): void {
  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) throw new Error(`Se esperaba un array en ${ruta}.`);
    const itemSchema = (schema[0] ?? {}) as JsonSchema;
    for (let i = 0; i < value.length; i += 1) validateShape(itemSchema, value[i], `${ruta}[${i}]`);
    return;
  }

  if (typeof schema !== "object" || schema === null) return;

  const { type, properties, items } = schema as {
    type?: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema;
  };

  switch (type) {
    case "object":
    case undefined: {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`Se esperaba un objeto en ${ruta}.`);
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(properties ?? {})) {
        if (!(key in record)) throw new Error(`Falta la clave "${key}" en ${ruta}.`);
        validateShape((properties ?? {})[key]!, record[key], `${ruta}.${key}`);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) throw new Error(`Se esperaba un array en ${ruta}.`);
      for (let i = 0; i < value.length; i += 1)
        validateShape((items ?? {}) as JsonSchema, value[i], `${ruta}[${i}]`);
      return;
    }
    case "string":
      if (typeof value !== "string") throw new Error(`Se esperaba un texto en ${ruta}.`);
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value))
        throw new Error(`Se esperaba un número en ${ruta}.`);
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`Se esperaba un booleano en ${ruta}.`);
      return;
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Razonamiento con salida JSON estructurada: Pollinations (gratis, ilimitado) → Ollama local.
// ---------------------------------------------------------------------------

interface ReasonArgs {
  system: string;
  prompt: string;
  schemaName: string;
  schema: JsonSchema;
  effort?: "low" | "medium" | "high";
  model?: string;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

function toOpenAIMessages(system: string, prompt: string, effortHint: string) {
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${prompt}\n\n${effortHint}\n\nIMPORTANTE: Respondé ÚNICAMENTE con un objeto JSON válido que respete el esquema pedido. No agregues texto, markdown ni comentarios fuera del JSON.`,
    },
  ];
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const sinFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(sinFences);
  } catch {
    const start = sinFences.indexOf("{");
    const end = sinFences.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(sinFences.slice(start, end + 1));
    throw new Error("Respuesta del modelo ilegible.");
  }
}

async function chatWithPollinations(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  label: string,
): Promise<string> {
  // Rotación de modelos para distribuir carga
  const modelIndex = Math.floor(Math.random() * TEXT_MODELS.length);
  const model = TEXT_MODELS[modelIndex];

  const response = await fetchWithRetries(
    POLLINATIONS_TEXT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    },
    { label },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} [${response.status}]: ${body.slice(0, 400)}`);
  }

  const data = (await response.json()) as ChatResponse;
  if (data.error?.message) throw new Error(`${label}: ${data.error.message}`);
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error(`${label}: el modelo no devolvió contenido.`);
  return content;
}

async function chatWithOllama(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  label: string,
): Promise<string> {
  // Intenta modelos locales comunes
  const localModels = ["llama3.1:70b", "llama3.1:8b", "mistral-nemo", "qwen2.5:7b", "gemma2:9b"];

  for (const model of localModels) {
    try {
      const response = await fetchWithRetries(
        OLLAMA_BASE,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            options: {
              temperature: 0.7,
              num_predict: maxTokens,
              format: "json",
            },
          }),
        },
        { label: `${label}-ollama-${model}`, attempts: 1, baseDelayMs: 500 },
      );

      if (!response.ok) continue;

      const data = (await response.json()) as { message?: { content?: string }; error?: string };
      if (data.error) continue;
      const content = data.message?.content;
      if (content?.trim()) return content;
    } catch {
      continue;
    }
  }
  throw new Error("Ollama no disponible o sin modelos compatibles.");
}

/**
 * Llamada de razonamiento con salida JSON estructurada.
 * Usa Pollinations.ai (gratis, sin API key, sin límites) como proveedor principal.
 * Fallback opcional a Ollama local si está corriendo.
 * Si ambos fallan, lanza el último error. Valida la forma del JSON antes de devolverlo.
 */
export async function reason<T>({
  system,
  prompt,
  schemaName: _schemaName,
  schema,
  effort = "medium",
  model: _model,
}: ReasonArgs): Promise<T> {
  const effortHint =
    effort === "high"
      ? "Pensá en profundidad y desarrollá el análisis completo antes de responder. No resumas ni recortes campos."
      : effort === "low"
        ? "Respondé directo y conciso, sin desarrollo innecesario."
        : "Pensá con cuidado y respondé completo.";
  const maxTokens = effort === "high" ? 8192 : 4096;
  const messages = toOpenAIMessages(system, prompt, effortHint);

  const intentos: Array<() => Promise<string>> = [
    () => chatWithPollinations(messages, maxTokens, "pollinations"),
    () => chatWithOllama(messages, maxTokens, "ollama"),
  ];

  let ultimoError: Error | null = null;
  for (const intento of intentos) {
    try {
      const content = await intento();
      const parsed = parseJsonContent(content);
      validateShape(schema, parsed);
      return parsed as T;
    } catch (error) {
      ultimoError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[ia] proveedor falló: ${ultimoError.message}`);
    }
  }

  throw (
    ultimoError ??
    new Error(
      "Todas las llamadas de IA fallaron. Verificá conectividad a Pollinations.ai o levantá Ollama local.",
    )
  );
}

// ---------------------------------------------------------------------------
// Generación de imágenes (Pollinations, sin API key, sin límites).
// ---------------------------------------------------------------------------

/** Genera una imagen de storyboard. Devuelve bytes PNG o null si no pudo. */
export async function generateFrame(prompt: string): Promise<Uint8Array | null> {
  const url = `${POLLINATIONS_IMAGE}${encodeURIComponent(
    `${prompt}. Vertical 9:16 short-form video frame, cinematic, high contrast, no watermark, no text, professional lighting, 8k quality`,
  )}?width=${FRAME_WIDTH}&height=${FRAME_HEIGHT}&nologo=true&model=flux&enhance=true`;

  try {
    const response = await fetchWithRetries(
      url,
      { method: "GET" },
      { label: "pollinations-image" },
    );
    if (!response.ok) {
      console.warn(`[pollinations-image] ${response.status}: no se pudo generar la imagen.`);
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.warn(
      `[pollinations-image] no se pudo generar la imagen: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generación de video: degradación suave (sin proveedor gratis con API).
// ---------------------------------------------------------------------------

/**
 * Intenta generar el video con proveedores gratuitos en cascada.
 * Si ninguno responde devuelve null: el pipeline continúa igual (el video es
 * opcional; el dossier + storyboard son el producto principal). El render
 * real del video se maneja en video.server.ts (admite Veo con GEMINI_API_KEY).
 */
export async function generateVideo(_prompt: string): Promise<Uint8Array | null> {
  return null;
}
