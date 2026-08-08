// Umbrales configurables del control de calidad. Compartido cliente/servidor.

export interface QualityGate {
  /** Puntaje total mínimo para aprobar (0-100). */
  minTotal: number;
  /** Mínimo del gancho: sin gancho no se publica. */
  minHook: number;
  /** Mínimo de impacto emocional. */
  minImpact: number;
  /** Mínimo del CTA / disparador de comentarios. */
  minCta: number;
  /** Mínimo aceptable en cualquier punto del checklist. */
  minAnyItem: number;
  /** Retención estimada mínima a los 3 segundos. */
  minRetention3s: number;
  /** Cantidad máxima de frases repetidas toleradas. */
  maxRepeats: number;
  /** Corte promedio máximo en segundos. */
  maxAvgCut: number;
}

export const DEFAULT_QUALITY_GATE: QualityGate = {
  minTotal: 80,
  minHook: 80,
  minImpact: 75,
  minCta: 65,
  minAnyItem: 70,
  minRetention3s: 60,
  maxRepeats: 0,
  maxAvgCut: 3.5,
};

export const QUALITY_GATE_LABELS: Record<keyof QualityGate, string> = {
  minTotal: "Puntaje total mínimo",
  minHook: "Gancho mínimo",
  minImpact: "Impacto emocional mínimo",
  minCta: "CTA mínimo",
  minAnyItem: "Mínimo por ítem del checklist",
  minRetention3s: "Retención 3s mínima (%)",
  maxRepeats: "Frases repetidas toleradas",
  maxAvgCut: "Corte promedio máximo (s)",
};

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

/** Resuelve el gate final: defaults + variables de entorno + override explícito. */
export function resolveQualityGate(override?: Partial<QualityGate>): QualityGate {
  const env =
    typeof process !== "undefined" ? process.env : ({} as Record<string, string | undefined>);
  const fromEnv = Number(env["QUALITY_MIN_SCORE"] ?? "");
  const base: QualityGate = {
    ...DEFAULT_QUALITY_GATE,
    ...(Number.isFinite(fromEnv) && fromEnv > 0 ? { minTotal: fromEnv } : {}),
  };
  const merged = { ...base, ...(override ?? {}) };
  return {
    minTotal: clamp(merged.minTotal, 0, 100),
    minHook: clamp(merged.minHook, 0, 100),
    minImpact: clamp(merged.minImpact, 0, 100),
    minCta: clamp(merged.minCta, 0, 100),
    minAnyItem: clamp(merged.minAnyItem, 0, 100),
    minRetention3s: clamp(merged.minRetention3s, 0, 100),
    maxRepeats: clamp(merged.maxRepeats, 0, 20),
    maxAvgCut: clamp(merged.maxAvgCut, 1, 10),
  };
}
