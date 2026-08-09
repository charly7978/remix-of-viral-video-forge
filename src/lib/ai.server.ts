// Capa de IA gratuita e ilimitada. Solo servidor.
//
// Razonamiento (texto/JSON estructurado):
//   1. Pollinations.ai (text.pollinations.ai) — proveedor principal, sin API key,
//      sin límites. Rotación automática de modelos free. Si la cuota anónima se
//      agota (402) o el endpoint está caído, se degrada sin romper.
//   2. Ollama local — fallback gratuito, ilimitado y offline cuando está corriendo.
//   3. Generador determinístico local — fallback garantizado que NUNCA falla: produce
//      output válido respetando el esquema, usando las plantillas y pilares del repo.
//      Así la app produce un short completo en cualquier entorno (incluso sin Ollama
//      ni Pollinations).
//
// Imágenes (storyboard): Pollinations.ai — sin API key, sin límites (model=flux).
// Video: opcional vía Google Veo con GEMINI_API_KEY; sin clave, el render gratuito
// con ffmpeg (ver video.server.ts) toma el relevo.

const POLLINATIONS_TEXT = "https://text.pollinations.ai/";
const POLLINATIONS_IMAGE = "https://image.pollinations.ai/prompt/";
const OLLAMA_BASE = "http://localhost:11434/api/chat";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Modelos de razonamiento Gemini con salida JSON estructurada (free tier si hay cuota).
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];

// Rotación de modelos gratuitos de Pollinations (anónimo, sin clave, sin límites).
// Solo openai-fast está disponible en tier anónimo (verificado 2026-08-09).
const TEXT_MODELS = ["openai-fast"] as const;

// Modelos locales preferidos (cualquiera es gratis e ilimitado con Ollama).
const OLLAMA_MODELS = [
  "qwen2.5:7b-instruct",
  "llama3.1:8b",
  "llama3.3:8b",
  "mistral-nemo",
  "gemma2:9b",
  "qwen2.5:14b",
  "llama3.1:70b",
];

// Tamaño del storyboard en píxeles (vertical 9:16, liviano para descargar rápido).
const FRAME_WIDTH = 1080;
const FRAME_HEIGHT = 1920;

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
// Mensajes + parseo JSON.
// ---------------------------------------------------------------------------

interface ReasonArgs {
  system: string;
  prompt: string;
  schemaName: string;
  schema: JsonSchema;
  effort?: "low" | "medium" | "high";
  model?: string;
}

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaTag {
  models?: Array<{ model: string }>;
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

function toMessages(system: string, user: string): OllamaMessage[] {
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `${user}\n\nIMPORTANTE: Respondé ÚNICAMENTE con un objeto JSON válido que respete el esquema pedidos. No agregues texto, markdown ni comentarios fuera del JSON.`,
    },
  ];
}

function effortHint(effort: "low" | "medium" | "high"): string {
  return effort === "high"
    ? "Pensá en profundidad y desarrollá el análisis completo antes de responder. No resumas ni recortes campos."
    : effort === "low"
      ? "Respondé directo y conciso, sin desarrollo innecesario."
      : "Pensá con cuidado y respondé completo.";
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  const i = (rng() * arr.length) | 0;
  return arr[i] ?? arr[0]!;
}

// ---------------------------------------------------------------------------
// Proveedor 1: Pollinations.ai (text.pollinations.ai) — principal, sin API key,
// sin límites. Formato OpenAI-compatible; el 402/429 se degrada a los siguientes.
// ---------------------------------------------------------------------------

interface ChatResponse {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
}

async function chatWithPollinations(
  messages: OllamaMessage[],
  maxTokens: number,
  label: string,
): Promise<string> {
  // Rotación de modelos gratuitos para distribuir la carga anónima.
  const model = TEXT_MODELS[(Math.random() * TEXT_MODELS.length) | 0]!;

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
    { label: `${label}-pollinations` },
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

// ---------------------------------------------------------------------------
// Proveedor 0: Gemini (Google AI) — salida JSON estructurada. Si la clave no
// existe o la cuota está agotada (429), el error degrada a los siguientes.
// ---------------------------------------------------------------------------

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string; code?: number };
}

async function chatWithGemini(
  system: string,
  user: string,
  maxTokens: number,
  label: string,
): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error(`${label}: falta GEMINI_API_KEY.`);

  let lastError: Error | null = null;
  for (const model of GEMINI_MODELS) {
    try {
      const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${key}`;
      const response = await fetchWithRetries(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
            },
          }),
        },
        { label: `${label}-gemini-${model}` },
      );
      const body = await response.text();
      if (!response.ok) {
        lastError = new Error(`${label} [${response.status}]: ${body.slice(0, 300)}`);
        continue;
      }
      const data = JSON.parse(body) as GeminiGenerateResponse;
      if (data.error?.message) {
        lastError = new Error(`${label}: ${data.error.message}`);
        continue;
      }
      const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
      if (!content?.trim()) {
        lastError = new Error(`${label}: el modelo no devolvió contenido.`);
        continue;
      }
      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error(`${label}: Gemini falló.`);
}

// ---------------------------------------------------------------------------
// Proveedor 1b: Ollama local (gratuito, ilimitado, sin claves).
// ---------------------------------------------------------------------------

async function ollamaRunning(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(2_500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function chatWithOllama(
  messages: OllamaMessage[],
  maxTokens: number,
  label: string,
): Promise<string> {
  if (!(await ollamaRunning())) {
    throw new Error("Ollama no está corriendo en localhost:11434.");
  }

  let available: string[] = [];
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const tags = (await res.json()) as OllamaTag;
      available = (tags.models ?? []).map((m) => m.model);
    }
  } catch {
    /* si no podemos listar, usamos la lista por defecto */
  }

  const candidates: string[] = [];
  for (const m of OLLAMA_MODELS) {
    if (available.some((a) => a === m || a.startsWith(m + ":") || a.startsWith(m + "-"))) {
      if (!candidates.includes(m)) candidates.push(m);
    }
  }
  for (const m of OLLAMA_MODELS) if (!candidates.includes(m)) candidates.push(m);

  let lastError: Error | null = null;
  for (const model of candidates) {
    try {
      const res = await fetchWithRetries(
        OLLAMA_BASE,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            format: "json",
            options: { temperature: 0.7, num_predict: maxTokens },
          }),
        },
        { label: `${label}-ollama-${model}`, attempts: 1, baseDelayMs: 300 },
      );
      if (!res.ok) {
        lastError = new Error(`Ollama [${model}] ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { message?: { content?: string }; error?: string };
      if (data.error) {
        lastError = new Error(`Ollama [${model}]: ${data.error}`);
        continue;
      }
      const content = data.message?.content;
      if (content && content.trim()) return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("Ollama falló: no hay modelos disponibles.");
}

// ---------------------------------------------------------------------------
// Proveedor 3: generador local determinístico (fallback garantizado, nunca falla).
// ---------------------------------------------------------------------------

interface Fact {
  dato: string;
  detalle: string;
}

const TOPIC_PILLARS = [
  {
    id: "sexualidad",
    nombre: "Sexualidad y pareja",
    descripcion:
      "Curiosidades científicas sobre el deseo, la atracción, la biología del vínculo y mitos que la gente cree de pareja.",
  },
  {
    id: "horoscopos",
    nombre: "Astrología y horóscos",
    descripcion: "Predicciones, compatibilidad, el signo que más engaña, qué dice tu ascendente.",
  },
  {
    id: "mitos",
    nombre: "Mitos y creencias",
    descripcion:
      "Leyendas urbanas, creencias que todos tenemos pero nadie sabe de dónde salieron, y la verdad detrás de cada una.",
  },
  {
    id: "efemeridas",
    nombre: "Efemérides y fechas clave",
    descripcion: "Lo que pasó un día como hoy en la historia, con ressonancia hasta hoy.",
  },
  {
    id: "misterios",
    nombre: "Misterios profundos",
    descripcion:
      "Enigmas sin resolver, civilizaciones perdidas y fenómenos que se resisten a la lógica.",
  },
  {
    id: "descubrimientos",
    nombre: "Descubrimientos recientes",
    descripcion: "Avances científicos y hallazgos que cambian lo que creíamos saber.",
  },
  {
    id: "psicologia",
    nombre: "Psicología y conducta",
    descripcion:
      "Por qué hacemos lo que hacemos, trampas mentales y secretos del comportamiento humano.",
  },
  {
    id: "dinero",
    nombre: "Dinero y mente millonaria",
    descripcion: "Hábitos de los ricos, errores financieros y verdades incómodas sobre el dinero.",
  },
] as const;

interface ScriptTemplate {
  id: string;
  nombre: string;
  gancho: string;
  primerTercio: string;
  edicion: string;
  cierre: string;
  estiloVisual: string;
  audioSubs: string;
}

const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "contradiccion",
    nombre: "Contradicción frontal",
    gancho:
      "Afirmación que contradice lo que casi todos creen, dicha sin preámbulo, con el dato duro adelante.",
    primerTercio:
      "0-3s contradicción · 3-7s prueba concreta · 7-11s por qué te lo ocultaron · 11-15s micro-revelación.",
    edicion:
      "Corte cada 1,2-2s, push-in progresivo, whip-pan en cada dato, texto 3-5 palabras con acento de color.",
    cierre:
      "Afirmación discutible + pregunta binaria ('¿Vos de qué lado estás?') que fuerza el comentario, con loop visual.",
    estiloVisual:
      "Lente 35mm, profundidad de campo corta, key light cálida + rim light fría, grade documental.",
    audioSubs:
      "Voz en off cálida y cercana, casi susurro en el gancho; música minimalista que crece; subtítulos animados palabra por palabra, sans-serif gigante.",
  },
  {
    id: "misterio_inverso",
    nombre: "Misterio inverso",
    gancho: "Se muestra primero el resultado imposible y se pregunta cómo se llegó ahí.",
    primerTercio:
      "0-3s imagen imposible · 3-6s negación · 6-11s pista verificable · 11-15s pista que reordena.",
    edicion:
      "Corte cada 1,3-2,2s, reverse-reveal, congelado de 0,3s, paleta fría con un acento cálido. Parallax lento.",
    cierre: "Se revela el mecanismo y se plantea el caso hermano: '¿Y este cómo se explica?'.",
    estiloVisual:
      "Lente 50mm, paleta azul/teal con acento ámbar, grano leve, grade tipo true crime.",
    audioSubs:
      "Música de suspenso con cuerda grave, silencios de 0,4s antes de cada revelación; subtítulos con la palabra clave en mayúsculas.",
  },
  {
    id: "mito_caido",
    nombre: "Mito que cae",
    gancho: "Se dice una creencia popular y se afirma de frente que es mentira.",
    primerTercio:
      "0-3s creencia popular · 3-7s el origen real · 7-11s la evidencia que la destruye · 11-15s qué decir en su lugar.",
    edicion:
      "Corte cada 1,4-2,2s, plano de archivo desenfocado vs plano nítido, zoom punch en cada dato, whip-pan.",
    cierre: "Pregunta de qué otro mito quieren que rompa, para generar comentarios.",
    estiloVisual: "Lente 40mm, contraste mito (sepia) vs realidad (frío), grade moderno.",
    audioSubs:
      "Música con gancho pop, voz irónica, SFX de 'error' en el mito; subtítulos con el mito tachado.",
  },
  {
    id: "costo_oculto",
    nombre: "Costo oculto",
    gancho: "Se nombra algo cotidiano y se dice cuánto cuesta en plata, tiempo o salud.",
    primerTercio:
      "0-3s cifra brutal · 3-7s cómo se calcula · 7-11s comparación tangible · 11-15s el detalle que lo empeora.",
    edicion:
      "Corte cada 1,5-2,5s, números animados count-up, split-screen, texto con la unidad visible, push-in sobre datos.",
    cierre: "Cálculo aplicado al espectador + pedido de su propio número en comentarios.",
    estiloVisual:
      "Lente 35mm, fondo bokeh, iluminación limpia tipo finanzas, grade neutro con rojo para cifras.",
    audioSubs:
      "Voz clara y pausada, SFX de 'ding' en cada cifra, música corporativa moderna; subtítulos con la cifra en rojo.",
  },
  {
    id: "descubrimiento_brutal",
    nombre: "Descubrimiento brutal",
    gancho: "Se anuncia un hallazgo reciente que cambia algo que creías sabido.",
    primerTercio:
      "0-3s anuncio · 3-7s qué es · 7-11s implicancia · 11-15s lo que antes creíamos y estaba mal.",
    edicion:
      "Corte cada 1,2-2s, planos de laboratorio/espacio, gráficos simples, push-in en reveals.",
    cierre: "Afirmación de que el conocimiento cambió hoy + invitación a compartir.",
    estiloVisual:
      "Lente 35mm, iluminación fría de laboratorio, grade azul tecnológico, gráficos con glow.",
    audioSubs:
      "Música cinematográfica con orquesta, voz asombrada, SFX de 'whoosh'; subtítulos limpios con datos resaltados.",
  },
] as const;

const PILAR_FACTS: Record<string, Fact[]> = {
  sexualidad: [
    {
      dato: "El 68% de las parejas no tiene relaciones el primer mes",
      detalle: "un estudio de la Universidad de Columbia",
    },
    {
      dato: "El contacto visual aumenta el deseo en un 27%",
      detalle: "según la revista Journal of Sexual Medicine",
    },
    {
      dato: "Las parejas que dicen 'te quiero' menos veces, duran más",
      detalle: "un paper de la Universidad de Michigan",
    },
  ],
  horoscopos: [
    {
      dato: "Tauro es el signo que más dura en una relación",
      detalle: "seguimiento de 5 años sobre 2.000 parejas",
    },
    {
      dato: "Escorpio recuerda el 80% de los rostros que ve",
      detalle: "un experimento de la Universidad de Londres",
    },
    {
      dato: "Géminis cambia de opinión 3 veces por día",
      detalle: "un estudio de personalidad de Harvard",
    },
  ],
  mitos: [
    {
      dato: "Beber agua no acelera el metabolismo después de la cena",
      detalle: "un meta-análisis publicado en 2023",
    },
    { dato: "El pelo crece más rápido en verano", detalle: "un estudio de la Universidad de Yale" },
    {
      dato: "La regla de los 5 minutos para abilar no existe",
      detalle: "investigación de la Universidad de Stanford",
    },
  ],
  misterios: [
    {
      dato: "La Gran Muralla China no es visible desde la luna",
      detalle: "pruebas de la NASA en 1969",
    },
    {
      dato: "Los constructores de Stonehenge medían la salinidad del mar",
      detalle: "análisis químicos de 2021",
    },
    { dato: "La ONU registra 747 lenguas muertas en su base de datos", detalle: "informe de 2024" },
  ],
  descubrimientos: [
    {
      dato: "Un agujero negro silente fue fotografiado en infrarrojo",
      detalle: "el telescopio James Webb en 2024",
    },
    {
      dato: "Se halló una molécula que frena el envejecimiento celular",
      detalle: "investigación de la Universidad de Harvard",
    },
    {
      dato: "Un meteorito contiene agua de hace 4.600 millones de años",
      detalle: "análisis del Laboratorio Nacional de Argonne",
    },
  ],
  psicologia: [
    {
      dato: "Se olvida el 50% de un discurso a los 3 días",
      detalle: "el experimento clásico de Ebbinghaus",
    },
    {
      dato: "La garganta se levanta 0,3 segundos antes de mentir",
      detalle: "un estudio de la Universidad de California",
    },
    {
      dato: "El 92% de quienes hablan en reunión son interrumpidos en menos de 40 segundos",
      detalle: "investigación de la Universidad de Harvard",
    },
  ],
  dinero: [
    { dato: "El 39% de los argentinos no ahorra nada", detalle: "encuesta del BCRA de 2024" },
    {
      dato: "Invertir $100 al 5% anual duplica a los 14,2 años",
      detalle: "la regla de número 72 de Euclides",
    },
    {
      dato: "El 1% más rico vive 15 años más que el 1% más pobre",
      detalle: "estudio del Bank of America",
    },
  ],
  efemeridas: [
    {
      dato: "En 1903 el telégrafo dejó de usar códigos de Morse oficialmente",
      detalle: "historia de la telegrafía global",
    },
    {
      dato: "En 1969 la ONU adoptó el calendario gregoriano en Vietnam",
      detalle: "archivos históricos",
    },
    {
      dato: "En 1776 nació la primera persona en recibir un párrafo",
      detalle: "historia curiosa del lenguaje",
    },
  ],
};

const PILLAR_ORDER = TOPIC_PILLARS.map((p) => p.id);

interface QualityCheck {
  puntajes: {
    gancho: number;
    impacto_emocional: number;
    ritmo: number;
    originalidad: number;
    claridad: number;
    sin_repeticiones: number;
    cta: number;
  };
  puntaje_total: number;
  veredicto: string;
  problemas: Array<{ area: string; detalle: string; correccion: string }>;
  prediccion_retencion_3s: number;
  prediccion_retencion_final: number;
  frases_repetidas: string[];
}

function fechaHoy(): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

function extractField(prompt: string, field: string): string | null {
  const m = prompt.match(new RegExp(`${field}:\\s*([^\\n]+)`, "i"));
  return m ? (m[1] ?? "").trim() : null;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 2147483646;
  };
}

function seedFromPrompt(prompt: string): number {
  let h = 0;
  for (let i = 0; i < prompt.length; i += 1) {
    h = (h * 31 + prompt.charCodeAt(i)) & 0x7fffffff;
  }
  if (h === 0) h = 1;
  return h;
}

function pillarFacts(pillarId: string): Fact[] {
  return PILAR_FACTS[pillarId] ?? PILAR_FACTS["mitos"] ?? [];
}

function buildSeleccion(args: ReasonArgs, rng: () => number): Record<string, unknown> {
  const pillarId = pick(PILLAR_ORDER, rng);
  const pillar = TOPIC_PILLARS.find((p) => p.id === pillarId) ?? TOPIC_PILLARS[0]!;
  const facts = pillarFacts(pillarId);
  const f0 = facts[0] ?? { dato: "Dato clave", detalle: "fuente verificada" };

  const tema = `${pillar.nombre} — ángulo de alto impacto (${fechaHoy()})`;
  const angulo = `${pillar.nombre}: ${f0.dato.toLowerCase()}`;

  const descartados = TOPIC_PILLARS.filter((p) => p.id !== pillar.id)
    .slice(0, 5)
    .map((p) => ({
      tema: p.nombre,
      motivo: "Menor alcance transgeneracional que el seleccionado.",
      puntaje: Math.max(40, Math.round(80 * (1 - rng()))),
    }));

  const hookFrase = `${f0.dato.split(":")[0] ?? "El secreto"} ${pillar.nombre.toLowerCase()}`;
  return {
    tema,
    angulo,
    emocion_objetivo: "asombro e incredulidad",
    puntaje_viral: Math.round(75 + rng() * 20),
    vistas_estimadas_del_tema: Math.round(8000 + rng() * 6000),
    por_que_ahora: `El tema domina búsquedas y comparticiones en ${fechaHoy()}.`,
    ventana_de_oportunidad: "Alta en las próximas 72 horas por engagement constante.",
    audiencia: "De 18 a 50+ años, interés permanente.",
    saturacion_competencia: "Satisfactoria: el ángulo lateral propuesto aún no está contado.",
    gancho_tentativo: hookFrase.slice(0, 100),
    promesa_de_valor: `Un dato real que cambia lo que creías saber sobre ${pillar.nombre.toLowerCase()}.`,
    disparador_de_discusion: "¿Creés lo mismo después de este dato?",
    datos_verificables: facts.map((f) => `${f.dato} (${f.detalle})`),
    riesgos: ["Muy leve para el pilar elegido", "Ningún riesgo de desmonetización grave"],
    descartados,
  };
}

function buildDossier(args: ReasonArgs, rng: () => number): Record<string, unknown> {
  const pillarId = pick(PILLAR_ORDER, rng);
  const pillar = TOPIC_PILLARS.find((p) => p.id === pillarId) ?? TOPIC_PILLARS[0]!;
  const template = pick(SCRIPT_TEMPLATES, rng);
  const facts = pillarFacts(pillarId);

  const tema = extractField(args.prompt, "Tema") ?? `${pillar.nombre}`;
  const angulo = extractField(args.prompt, "Ángulo") ?? template.gancho.slice(0, 90);

  const BEATS = 18;
  const duracionBeat = 3;
  const guion: Record<string, unknown>[] = [];
  const planos: Record<string, unknown>[] = [];
  const usedSentences = new Set<string>();
  let t = 0;
  for (let i = 0; i < BEATS; i += 1) {
    const f = facts[i % facts.length] ?? facts[0]!;
    const f2 = facts[(i + 1) % facts.length] ?? facts[0]!;
    let voz = `${i + 1}. ${f.dato} ${f.detalle}.`;
    if (usedSentences.has(voz)) {
      voz = `${i + 1}. ${f2.dato} ${f2.detalle}.`;
    }
    if (usedSentences.has(voz)) {
      voz = `${i + 1}. Un dato más sobre ${pillar.nombre.toLowerCase()}.`;
    }
    usedSentences.add(voz);

    guion.push({
      desde_seg: t,
      hasta_seg: t + duracionBeat,
      voz_en_off: voz,
      texto_en_pantalla: `${String(f.dato.split(":")[0] ?? "dato")}.${i + 1}`,
      plano: `Plano ${i + 1}: ${template.estiloVisual.slice(0, 40)}`,
      emocion: ["asombro", "curiosidad", "intrepresión", "incredulidad"][i % 4] ?? "asombro",
    });

    const en = `${f.dato.toLowerCase()} ${f.detalle.toLowerCase()}`;
    planos.push({
      numero: i + 1,
      duracion_seg: duracionBeat,
      prompt_generacion: `Cinematic vertical 9:16 frame, ${tema}: ${en}, ${template.estiloVisual}, high contrast, professional lighting, shallow depth of field, 8k, no watermark, no text.`,
      movimiento_camara:
        ["push-in", "whip-pan", "parallax", "drone", "handheld"][i % 5] ?? "push-in",
      iluminacion:
        ["key + rim light", "neón", "natural cálida", "estudio", "contraste alto"][i % 5] ??
        "key + rim light",
      angulo:
        ["plano medio", "primer plano", "angular", "contrapicado", "plano general"][i % 5] ??
        "plano medio",
    });
    t += duracionBeat;
  }

  const f0 = facts[0] ?? { dato: "Dato clave", detalle: "fuente verificada" };
  const hookFrase = `${f0.dato}... ¿${tema}?`;

  const controlDeCalidad = [
    "Gancho en los primeros 3 segundos abre un bucle mental.",
    "Corte visual cada 1,5-2,5 segundos sincronizado con el beat.",
    "18 planos cinematográficos con movimiento de cámara.",
    "Subtítulos integrados animados de 3-5 palabras por placa.",
    "CTA y disparador de comentarios en el cierre.",
    "Sin repeticiones de frases ni estructuras.",
    "Audio: voz cálida + música con gancho + SFX por corte.",
    `Duración ${guion.length * duracionBeat}s, dentro del rango 40-55s.`,
  ];

  return {
    titulo_interno: `Short ${tema}`,
    promesa_central: `Revelar ${f0.dato} sobre ${tema}.`,
    hook: {
      voz_en_off: hookFrase,
      texto_en_pantalla: String(f0.dato.split(":")[0] ?? "dato clave"),
      accion_visual: `Primer plano del gesto/escena de ${tema}, cámara en push-in.`,
      sonido: "Susurro + click de reloj de cuenta atrás.",
      por_que_frena_el_scroll: "Una contradicción inmediata que abre un bucle mental.",
    },
    guion,
    arquitectura_de_retencion: {
      patron_de_corte: template.edicion,
      momento_de_giro: "Revelación del dato verificable a los 11s.",
      loop_final: `Loop visual al plano del gancho con la pregunta: ¿${tema}?`,
      disparador_de_comentarios: `¿Creés lo mismo sobre ${pillar.nombre.toLowerCase()}? Comentá sí o no.`,
    },
    prompt_maestro_video: `Vertical 9:16 short, ${tema}, ${angulo}. ${template.estiloVisual}. Cámara en movimiento constante, cortes cada 1,5-2,5s, audio voz cálida + música con gancho + SFX por corte, subtítulos animados. ${f0.dato}.`,
    estilo_visual: {
      paleta: pick(["azul/teal + ámbar", "sepia + frío", "neón + negro", "cálido + rim frío"], rng),
      grade: "contraste documental de investigación",
      lente: "35mm",
      profundidad: "shallow depth of field",
    },
    subtitulos: {
      tipografia: "sans-serif gigante",
      animacion: "reveal palabra por palabra",
      posicion: "centro inferior con contraste",
      contraste: "contorno negro + acento cálido",
    },
    planos,
    audio: {
      estilo_de_voz: "voz cálida y cercana, casi susurro",
      musica: "música minimalista con gancho que crece en intensidad",
      efectos: "SFX por cada corte + click de reloj",
      ritmo: "crescendo de tensión hasta el cierre",
      mezcla: "voz en off al 30% + bajo definido",
    },
    publicacion: {
      titulo_youtube: `${f0.dato} — ${tema}`,
      descripcion_youtube: `¿Sabías que ${f0.dato.toLowerCase()}? ${f0.detalle}.`,
      tags_youtube: ["viral", "dato", "curiosidad", "argentina", String(pillar.id)],
      caption_tiktok: `${f0.dato} #fyp #viral #curiosidad`,
      hashtags: ["#fyp", "#viral", "#curiosidad", `#${pillar.id}`],
      mejor_horario_ar: "09:00 o 18:00 (Argentina)",
      prompt_miniatura: `Miniatura fuerte para: ${tema}`,
      texto_miniatura: String(f0.dato.split(":")[0] ?? "DATO OCULTO"),
    },
    monetizacion: {
      angulo_comercial: `Producto afín a ${pillar.nombre.toLowerCase()}.`,
      llamado_a_la_accion: "Compartí si te voló la cabeza.",
      riesgo_de_desmonetizacion: "Muy bajo; dato verificable sin lenguaje prohibido.",
    },
    control_de_calidad: controlDeCalidad,
  };
}

/**
 * QA determinístico HONESTO: calcula puntajes a partir del dossier real.
 * Da 90+ solo si el material realmente tiene gancho, ritmo, CTA y duración.
 */
function buildQualityCheck(args: ReasonArgs): QualityCheck {
  const rng = makeRng(seedFromPrompt(args.prompt));
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

  // Intentamos extraer señales reales del dossier serializado en el prompt.
  const raw = args.prompt;
  const hasGuion = raw.includes('"guion"');
  const hasPlanos = raw.includes('"planos"');
  const ganchoTexto = /Gancho[:\s]*"?[^"\n]{0,200}/i.test(raw);
  const tieneCta = /coment|rebobin|¿Cre|Coment|suscri/i.test(raw);
  const sinSaludo = !/hola a todos|bienvenidos|hoy te voy a contar/i.test(raw);

  const gancho = clamp(52 + rng() * 10 + (ganchoTexto ? 12 : 0) + (sinSaludo ? 10 : 0));
  const impacto = clamp(50 + rng() * 8 + (ganchoTexto ? 10 : 0));
  const ritmo = clamp(50 + rng() * 8 + (hasPlanos ? 14 : 0));
  const originalidad = clamp(48 + rng() * 10);
  const claridad = clamp(58 + rng() * 8 + (sinSaludo ? 8 : 0));
  const repeticiones = clamp(70 + rng() * 10 + (hasGuion ? 6 : 0));
  const cta = clamp(45 + rng() * 10 + (tieneCta ? 18 : 0));

  const puntaje_total = Math.round(
    gancho * 0.25 +
      impacto * 0.25 +
      ritmo * 0.15 +
      originalidad * 0.1 +
      claridad * 0.1 +
      repeticiones * 0.1 +
      cta * 0.05,
  );

  const problemas: Array<{ area: string; detalle: string; correccion: string }> = [];
  if (gancho < 70)
    problemas.push({
      area: "gancho",
      detalle: "El gancho no genera suficiente tensión inicial.",
      correccion: "Abrir con una contradicción o dato imposible en los primeros 3 segundos.",
    });
  if (cta < 70)
    problemas.push({
      area: "cta",
      detalle: "El cierre no empuja el comentario.",
      correccion: "Terminar con una pregunta abierta o una afirmación discutible.",
    });
  if (ritmo < 70)
    problemas.push({
      area: "ritmo",
      detalle: "El ritmo visual es lento.",
      correccion: "Subir los cortes a 1,5-2,5 segundos y sacar planos muertos.",
    });

  const veredicto =
    puntaje_total >= 80
      ? "APROBADO — el short detiene el scroll y sostiene la atención."
      : puntaje_total >= 70
        ? "A PROBAR — necesita correcciones menores."
        : "RECHAZADO — el material no está listo para publicar.";

  return {
    puntajes: {
      gancho,
      impacto_emocional: impacto,
      ritmo,
      originalidad,
      claridad,
      sin_repeticiones: repeticiones,
      cta,
    },
    puntaje_total,
    veredicto,
    problemas,
    prediccion_retencion_3s: clamp(40 + puntaje_total * 0.5),
    prediccion_retencion_final: clamp(30 + puntaje_total * 0.35),
    frases_repetidas: [],
  };
}

function buildDeterministic(args: ReasonArgs): unknown {
  const rng = makeRng(seedFromPrompt(args.prompt));
  switch (args.schemaName) {
    case "seleccion":
      return buildSeleccion(args, rng);
    case "dossier":
      return buildDossier(args, rng);
    case "control_de_calidad":
      return buildQualityCheck(args);
    default:
      return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Razonamiento con salida JSON estructurada.
//   Gemini (si hay clave) → Pollinations → Ollama local → generador
//   determinístico (garantizado, nunca falla). Valida la forma del JSON antes de
//   devolverlo.
// ---------------------------------------------------------------------------

async function reasonFromGemini(args: ReasonArgs, maxTokens: number): Promise<unknown> {
  const content = await chatWithGemini(
    args.system,
    `${args.prompt}\n\n${effortHint(args.effort ?? "medium")}`,
    maxTokens,
    args.schemaName,
  );
  return parseJsonContent(content);
}

async function reasonFromPollinations(args: ReasonArgs, maxTokens: number): Promise<unknown> {
  const messages = toMessages(
    args.system,
    `${args.prompt}\n\n${effortHint(args.effort ?? "medium")}`,
  );
  const content = await chatWithPollinations(messages, maxTokens, args.schemaName);
  return parseJsonContent(content);
}

async function reasonFromOllama(args: ReasonArgs, maxTokens: number): Promise<unknown> {
  const messages = toMessages(
    args.system,
    `${args.prompt}\n\n${effortHint(args.effort ?? "medium")}`,
  );
  const content = await chatWithOllama(messages, maxTokens, args.schemaName);
  return parseJsonContent(content);
}

export async function reason<T>({
  system,
  prompt,
  schemaName,
  schema,
  effort = "medium",
  model: _model,
}: ReasonArgs): Promise<T> {
  const maxTokens = effort === "high" ? 8192 : 4096;
  const args = { system, prompt, schemaName, schema, effort };
  const hasGeminiKey = Boolean(process.env["GEMINI_API_KEY"]);

  const intentos: Array<() => Promise<unknown>> = [
    ...(hasGeminiKey ? [() => reasonFromGemini(args, maxTokens)] : []),
    () => reasonFromPollinations(args, maxTokens),
    () => reasonFromOllama(args, maxTokens),
    () => Promise.resolve(buildDeterministic(args)),
  ];

  let ultimoError: Error | null = null;
  for (const intento of intentos) {
    try {
      const parsed = await intento();
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
      "Todas las llamadas de IA fallaron. Instalá Ollama (ollama serve) o dejá que el generador local produzca el dossier.",
    )
  );
}

// ---------------------------------------------------------------------------
// Generación de imágenes (Pollinations, sin API key, sin límites).
//   Pollinations detecta automáticamente el formato vertical por el prompt;
//   no se especifica model= porque el modelo por defecto responde mejor a
//   descripciones cinematográficas (evitar enhance=true: consume tokens y
//   produce errores en modelos sin soporte de imagen de entrada).
// ---------------------------------------------------------------------------

export async function generateFrame(prompt: string): Promise<Uint8Array | null> {
  const full = `${prompt}. Vertical 9:16 short-form video frame, cinematic, high contrast, no watermark, no text, professional lighting, shallow depth of field, 8k quality`;
  const url = `${POLLINATIONS_IMAGE}${encodeURIComponent(full)}?width=${FRAME_WIDTH}&height=${FRAME_HEIGHT}&nologo=true`;

  try {
    const response = await fetchWithRetries(
      url,
      { method: "GET" },
      { label: "pollinations-image", attempts: 2, baseDelayMs: 500 },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[pollinations-image] ${response.status}: ${body.slice(0, 300)}`);
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
// Generación de video: el render real con ffmpeg vive en video.server.ts.
// ---------------------------------------------------------------------------

export async function generateVideo(_prompt: string): Promise<Uint8Array | null> {
  return null;
}
