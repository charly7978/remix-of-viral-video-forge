// Control de calidad automático del short antes de aprobarlo y renderizarlo. Solo servidor.
import { reason } from "./ai.server";
import { DEFAULT_QUALITY_GATE, resolveQualityGate, type QualityGate } from "./quality-config";

export interface QualityCheck {
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
  mecanica?: MechanicalCheck;
  aprobado?: boolean;
  bloqueos?: string[];
  gate?: QualityGate;
}

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const str = { type: "string" } as const;
const num = { type: "number" } as const;

const qualitySchema = obj({
  puntajes: obj({
    gancho: num,
    impacto_emocional: num,
    ritmo: num,
    originalidad: num,
    claridad: num,
    sin_repeticiones: num,
    cta: num,
  }),
  puntaje_total: num,
  veredicto: str,
  problemas: { type: "array", items: obj({ area: str, detalle: str, correccion: str }) },
  prediccion_retencion_3s: num,
  prediccion_retencion_final: num,
  frases_repetidas: { type: "array", items: str },
});

export interface MechanicalCheck {
  duracion_total_seg: number;
  cantidad_de_planos: number;
  corte_promedio_seg: number;
  huecos_en_el_guion: number;
  frases_repetidas: string[];
  palabras_prohibidas: string[];
  hook_palabras: number;
  tiene_cta: boolean;
  problemas: string[];
}

const PROHIBIDAS = [
  "hoy te voy a contar",
  "hola a todos",
  "bienvenidos",
  "no te olvides de suscribirte",
  "dale like y suscribite",
  "en el video de hoy",
  "espero que les guste",
  "dato curioso",
];

function normalizar(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chequeos duros y deterministas sobre la estructura del dossier. */
export function mechanicalCheck(
  dossier: Record<string, unknown>,
  gate: QualityGate = DEFAULT_QUALITY_GATE,
): MechanicalCheck {
  const guion = Array.isArray(dossier["guion"]) ? (dossier["guion"] as Record<string, unknown>[]) : [];
  const planos = Array.isArray(dossier["planos"]) ? (dossier["planos"] as Record<string, unknown>[]) : [];
  const hook = (dossier["hook"] ?? {}) as Record<string, unknown>;
  const retencion = (dossier["arquitectura_de_retencion"] ?? {}) as Record<string, unknown>;
  const monetizacion = (dossier["monetizacion"] ?? {}) as Record<string, unknown>;

  const problemas: string[] = [];
  const beats = guion
    .map((beat) => ({
      desde: Number(beat["desde_seg"] ?? 0),
      hasta: Number(beat["hasta_seg"] ?? 0),
      voz: String(beat["voz_en_off"] ?? ""),
      texto: String(beat["texto_en_pantalla"] ?? ""),
    }))
    .sort((a, b) => a.desde - b.desde);

  const duracion = beats.length > 0 ? (beats[beats.length - 1]?.hasta ?? 0) : 0;
  let huecos = 0;
  for (let i = 1; i < beats.length; i += 1) {
    const previo = beats[i - 1]!;
    const actual = beats[i]!;
    if (actual.desde - previo.hasta > 0.3) huecos += 1;
  }

  if (duracion < 35 || duracion > 60) {
    problemas.push(`Duración fuera de rango: ${duracion}s (objetivo 40 a 55).`);
  }
  if (huecos > 0) problemas.push(`El guion tiene ${huecos} hueco(s) temporal(es).`);
  if (planos.length < 10) problemas.push(`Solo ${planos.length} planos: el ritmo va a ser lento.`);

  const corte = planos.length > 0 && duracion > 0 ? Number((duracion / planos.length).toFixed(2)) : 0;
  if (corte > gate.maxAvgCut) {
    problemas.push(`Corte promedio de ${corte}s: supera el máximo de ${gate.maxAvgCut}s.`);
  }

  // Frases repetidas: 4-gramas duplicados en toda la locución.
  const locucion = normalizar([String(hook["voz_en_off"] ?? ""), ...beats.map((b) => b.voz)].join(" "));
  const palabras = locucion.split(" ").filter(Boolean);
  const vistos = new Map<string, number>();
  for (let i = 0; i + 4 <= palabras.length; i += 1) {
    const gram = palabras.slice(i, i + 4).join(" ");
    vistos.set(gram, (vistos.get(gram) ?? 0) + 1);
  }
  const repetidas = [...vistos.entries()]
    .filter(([, count]) => count > 1)
    .map(([gram]) => gram)
    .slice(0, 8);
  if (repetidas.length > gate.maxRepeats) {
    problemas.push(`Repeticiones literales (${repetidas.length} > ${gate.maxRepeats}): ${repetidas.join(" | ")}`);
  }

  const prohibidas = PROHIBIDAS.filter((frase) => locucion.includes(normalizar(frase)));
  if (prohibidas.length > 0) problemas.push(`Muletillas prohibidas: ${prohibidas.join(" | ")}`);

  const hookPalabras = String(hook["voz_en_off"] ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (hookPalabras === 0) problemas.push("El gancho no tiene locución.");
  if (hookPalabras > 22) problemas.push(`Gancho de ${hookPalabras} palabras: no entra en 3 segundos.`);

  const ctaTexto = [
    String(retencion["disparador_de_comentarios"] ?? ""),
    String(retencion["loop_final"] ?? ""),
    String(monetizacion["llamado_a_la_accion"] ?? ""),
  ]
    .join(" ")
    .trim();
  const tieneCta = ctaTexto.length > 15;
  if (!tieneCta) problemas.push("Falta un llamado a la acción o disparador de comentarios concreto.");

  return {
    duracion_total_seg: duracion,
    cantidad_de_planos: planos.length,
    corte_promedio_seg: corte,
    huecos_en_el_guion: huecos,
    frases_repetidas: repetidas,
    palabras_prohibidas: prohibidas,
    hook_palabras: hookPalabras,
    tiene_cta: tieneCta,
    problemas,
  };
}

const AUDITOR = `Sos el auditor de calidad más exigente de una operación de shorts virales. Tu trabajo NO es
elogiar: es encontrar todo lo que hace que un espectador deslice el dedo y se vaya. Puntuás con severidad
(80 o más solo si el material realmente detiene el scroll y sostiene la atención hasta el final).
Escribís en español rioplatense, directo y sin diplomacia.`;

/** Evalúa el dossier: checklist mecánico + auditoría de IA. */
export async function evaluateQuality(
  dossier: Record<string, unknown>,
  tema: string,
  gateOverride?: Partial<QualityGate>,
): Promise<QualityCheck> {
  const gate = resolveQualityGate(gateOverride);
  const mecanica = mechanicalCheck(dossier, gate);

  const critica = await reason<QualityCheck>({
    system: AUDITOR,
    schemaName: "control_de_calidad",
    schema: qualitySchema,
    effort: "medium",
    prompt: `Auditá este short vertical de 45 segundos sobre "${tema}".

Checklist obligatorio, puntaje de 0 a 100 en cada punto:
1. gancho: los primeros 3 segundos abren un bucle mental imposible de ignorar.
2. impacto_emocional: genera una reacción física (asombro, bronca, miedo, ternura, incredulidad).
3. ritmo: corte visual cada 1,5 a 3 segundos, sin mesetas ni relleno.
4. originalidad: no es lo que ya dijeron todos sobre el tema.
5. claridad: se entiende sin esfuerzo en una sola pasada, con sonido bajo.
6. sin_repeticiones: no repite frases, ideas ni estructuras.
7. cta: el cierre empuja el comentario o el rebobinado, sin pedir suscripción genérica.

puntaje_total: promedio ponderado dando el doble de peso a gancho e impacto_emocional.
prediccion_retencion_3s y prediccion_retencion_final: porcentajes estimados de 0 a 100.
problemas: cada falla con su corrección concreta y accionable. Si algo está flojo, decilo.
frases_repetidas: citas textuales repetidas o casi idénticas.

Diagnóstico automático ya detectado (tenelo en cuenta y no lo contradigas):
${mecanica.problemas.length > 0 ? mecanica.problemas.map((p) => `- ${p}`).join("\n") : "- Sin fallas estructurales."}

Dossier completo:
${JSON.stringify(dossier).slice(0, 40_000)}`,
  });

  const puntajes = critica.puntajes ?? ({} as QualityCheck["puntajes"]);
  const valores = Object.values(puntajes).filter((value) => typeof value === "number");
  const minimo = valores.length > 0 ? Math.min(...valores) : 0;

  // Reglas de aprobación/bloqueo contra el gate configurable.
  const bloqueos: string[] = [];
  if (mecanica.problemas.length > 0) bloqueos.push(...mecanica.problemas);
  if ((critica.puntaje_total ?? 0) < gate.minTotal) {
    bloqueos.push(
      `Puntaje total ${Math.round(critica.puntaje_total ?? 0)}: por debajo del mínimo de ${gate.minTotal}.`,
    );
  }
  if (minimo < gate.minAnyItem) {
    bloqueos.push(`Hay un punto del checklist en ${Math.round(minimo)} (mínimo ${gate.minAnyItem}).`);
  }
  if ((puntajes.gancho ?? 0) < gate.minHook) {
    bloqueos.push(`Gancho en ${Math.round(puntajes.gancho ?? 0)}: mínimo ${gate.minHook}. Sin gancho no se publica.`);
  }
  if ((puntajes.impacto_emocional ?? 0) < gate.minImpact) {
    bloqueos.push(
      `Impacto emocional en ${Math.round(puntajes.impacto_emocional ?? 0)}: mínimo ${gate.minImpact}.`,
    );
  }
  if ((puntajes.cta ?? 0) < gate.minCta) {
    bloqueos.push(`CTA en ${Math.round(puntajes.cta ?? 0)}: mínimo ${gate.minCta}.`);
  }
  if ((critica.prediccion_retencion_3s ?? 0) < gate.minRetention3s) {
    bloqueos.push(
      `Retención estimada a los 3s ${Math.round(critica.prediccion_retencion_3s ?? 0)}%: mínimo ${gate.minRetention3s}%.`,
    );
  }
  if ((critica.frases_repetidas ?? []).length > gate.maxRepeats) {
    bloqueos.push(
      `El auditor detectó ${(critica.frases_repetidas ?? []).length} frases repetidas (máximo ${gate.maxRepeats}).`,
    );
  }

  return { ...critica, mecanica, bloqueos, gate, aprobado: bloqueos.length === 0 };
}
