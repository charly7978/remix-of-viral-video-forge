// Generación de video vertical. Solo servidor.
// Estrategia gratuita: Google Gemini (Veo) como proveedor principal. Si no hay
// clave o el modelo no está disponible, la corrida no falla: el short aprobado
// queda con su dossier, storyboard y prompt maestro, y la UI muestra el estado
// "failed" con un mensaje accionable (botón Generar ahora / Regenerar).

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Veo genera video vertical. Es un modelo de pago/billable, pero se usa la
// misma clave GEMINI_API_KEY; sin clave, todo degrada con elegancia.
const MODEL_VIDEO = "veo-3.1-lite";

function apiKey(): string {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error(
    "No hay GEMINI_API_KEY: el render de video necesita una clave de Google AI Studio. El dossier y el storyboard ya están listos.",
  );
  return key;
}

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked" | string;
  progress?: number;
  error?: string;
}

/**
 * Encola un video vertical 9:16. Usa la API asíncrona de Gemini (Veo) con un
 * job de larga duración: arranca, devuelve el id, y `getVideoJob` consulta.
 */
export async function startVideoJob(prompt: string): Promise<VideoJob> {
  const key = apiKey();
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt.slice(0, 4000) }],
      },
    ],
    // Configuración por defecto de Veo: vertical, 8 segundos.
    generationConfig: {
      aspectRatio: "9:16",
      durationSeconds: "8",
    },
  };

  const url = `${GEMINI_BASE}/models/${MODEL_VIDEO}:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  const body = await response.text();
  if (!response.ok) {
    const message = body.slice(0, 400);
    // 403/404 = el modelo no está habilitado para esta clave/región.
    if (response.status === 403 || response.status === 404) {
      throw new Error(
        "El modelo de video no está disponible con esta clave GEMINI_API_KEY (free tier no incluye video). El dossier y el storyboard ya están listos.",
      );
    }
    throw new Error(`Servicio de video [${response.status}]: ${message}`);
  }

  const data = JSON.parse(body) as {
    name?: string;
    candidates?: Array<{ content?: { parts?: Array<{ fileData?: { fileUri?: string } }> } }>;
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(`Servicio de video: ${data.error.message}`);
  }

  // Veo devuelve un nombre de operación larga (operations/…) o un fileUri.
  const id = data.name ?? data.candidates?.[0]?.content?.parts?.[0]?.fileData?.fileUri;
  if (!id) throw new Error("El proveedor no devolvió un identificador de video.");

  return { id, status: "in_progress", progress: 10 };
}

/** Consulta el estado del job de video. */
export async function getVideoJob(id: string): Promise<VideoJob> {
  const key = apiKey();
  // Si el id es un fileUri ya terminado, devolver completed directo.
  if (id.startsWith("https://") || id.startsWith("gs://")) {
    return { id, status: "completed", progress: 100 };
  }

  const url = `${GEMINI_BASE}/${id}?key=${key}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Estado de video [${response.status}]: ${body.slice(0, 400)}`);
  }

  const data = JSON.parse(body) as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      candidates?: Array<{ content?: { parts?: Array<{ fileData?: { fileUri?: string } }> } }>;
    };
  };

  if (data.error?.message) {
    return { id, status: "failed", error: data.error.message };
  }
  if (data.done) {
    const uri = data.response?.candidates?.[0]?.content?.parts?.[0]?.fileData?.fileUri;
    return uri
      ? { id: uri, status: "completed", progress: 100 }
      : { id, status: "failed", error: "El video terminó sin archivo descargable." };
  }

  return { id, status: "in_progress", progress: 60 };
}

/** Descarga el MP4 terminado. El fileUri de Gemini puede ser un link firmado. */
export async function downloadVideo(id: string): Promise<Uint8Array> {
  if (!id.startsWith("http")) {
    throw new Error("El video aún no tiene una URL de descarga.");
  }
  const response = await fetch(id, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Descarga de video [${response.status}]`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
