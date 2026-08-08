// Clasificación de errores del proveedor de IA. Compartido cliente/servidor.

export type ProviderErrorKind =
  "credits" | "rate_limit" | "missing_key" | "unavailable" | "timeout" | "unknown";

export interface ProviderErrorInfo {
  kind: ProviderErrorKind;
  titulo: string;
  detalle: string;
  /** Acciones sugeridas para la interfaz. */
  acciones: Array<{ label: string; href?: string; action?: "recargar" | "reintentar" }>;
  /** Si conviene reintentar automáticamente más tarde. */
  reintentable: boolean;
}

const has = (haystack: string, needles: string[]) =>
  needles.some((needle) => haystack.includes(needle));

/** Detecta 402 / cuota agotada / falta de clave a partir del mensaje crudo. */
export function classifyProviderError(raw: unknown): ProviderErrorInfo {
  const message = (raw instanceof Error ? raw.message : String(raw ?? "")).trim();
  const lower = message.toLowerCase();

  if (
    lower.includes("402") ||
    has(lower, [
      "not enough credits",
      "insufficient credits",
      "insufficient_quota",
      "payment required",
      "billing",
      "requires billing",
      "free tier",
      "quota exceeded",
      "current quota",
      "limit: 0",
      "saldo",
      "creditos",
      "créditos",
    ])
  ) {
    return {
      kind: "credits",
      titulo: "Sin créditos de IA para generar el video",
      detalle:
        "El generador de video de Google (Veo) rechazó la generación por falta de facturación habilitada en la cuenta. El dossier, el storyboard y el prompt maestro ya están listos: al habilitar la facturación, se puede reintentar el render sin repetir el análisis.",
      acciones: [
        {
          label: "Habilitar facturación en Google AI Studio",
          href: "https://aistudio.google.com/apikey",
        },
        { label: "Reintentar generación", action: "reintentar" },
      ],
      reintentable: false,
    };
  }

  if (lower.includes("429") || has(lower, ["rate limit", "resource_exhausted", "quota"])) {
    return {
      kind: "rate_limit",
      titulo: "Límite de pedidos alcanzado",
      detalle:
        "El proveedor limitó la cantidad de pedidos por minuto. Esperá unos minutos y reintentá.",
      acciones: [{ label: "Reintentar generación", action: "reintentar" }],
      reintentable: true,
    };
  }

  if (
    has(lower, [
      "falta gemini_api_key",
      "falta ",
      "no hay gemini_api_key",
      "api key not valid",
      "401",
      "403",
    ])
  ) {
    return {
      kind: "missing_key",
      titulo: "Falta o no sirve la clave del proveedor de video",
      detalle: message,
      acciones: [
        { label: "Obtener clave en Google AI Studio", href: "https://aistudio.google.com/apikey" },
        { label: "Reintentar generación", action: "reintentar" },
      ],
      reintentable: false,
    };
  }

  if (has(lower, ["timeout", "abort"])) {
    return {
      kind: "timeout",
      titulo: "El proveedor tardó demasiado",
      detalle: message,
      acciones: [{ label: "Reintentar generación", action: "reintentar" }],
      reintentable: true,
    };
  }

  if (has(lower, ["no está disponible", "not available", "404", "unavailable", "500", "503"])) {
    return {
      kind: "unavailable",
      titulo: "El modelo de video no está disponible",
      detalle: message,
      acciones: [
        { label: "Verificar en Google AI Studio", href: "https://aistudio.google.com/apikey" },
        { label: "Reintentar generación", action: "reintentar" },
      ],
      reintentable: true,
    };
  }

  return {
    kind: "unknown",
    titulo: "Falló la generación de video",
    detalle: message || "Error desconocido.",
    acciones: [{ label: "Reintentar generación", action: "reintentar" }],
    reintentable: true,
  };
}
