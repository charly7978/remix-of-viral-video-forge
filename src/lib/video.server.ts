import { gatewayError } from "./ai.server";
// Generación de video vertical con el gateway de IA de Lovable. Solo servidor.
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Falta LOVABLE_API_KEY en el servidor.");
  return key;
}

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | string;
  progress?: number;
  error?: string;
}

/** Encola un video vertical 9:16 de 8 segundos. Devuelve el trabajo en curso. */
export async function startVideoJob(prompt: string): Promise<VideoJob> {
  const response = await fetch(`${GATEWAY}/videos`, {
    method: "POST",
    headers: { "Lovable-API-Key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/veo-3.1-lite",
      prompt: prompt.slice(0, 4000),
      size: "720x1280",
      seconds: "8",
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw gatewayError(response.status, body);
  }

  const data = JSON.parse(body) as VideoJob;
  if (!data.id) throw new Error("El gateway no devolvió un identificador de video.");
  return data;
}

export async function getVideoJob(id: string): Promise<VideoJob> {
  const response = await fetch(`${GATEWAY}/videos/${id}`, {
    headers: { "Lovable-API-Key": apiKey() },
  });
  const body = await response.text();
  if (!response.ok) {
    throw gatewayError(response.status, body);
  }
  return JSON.parse(body) as VideoJob;
}

/** Descarga el MP4 terminado. El gateway redirige a almacenamiento firmado. */
export async function downloadVideo(id: string): Promise<Uint8Array> {
  const response = await fetch(`${GATEWAY}/videos/${id}/content`, {
    headers: { "Lovable-API-Key": apiKey() },
    redirect: "follow",
  });
  if (!response.ok) {
    throw gatewayError(response.status, "descarga de video");
  }
  return new Uint8Array(await response.arrayBuffer());
}
