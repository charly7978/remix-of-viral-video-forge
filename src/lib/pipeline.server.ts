// Orquestador de la producción de shorts virales permanentes. Solo servidor.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateFrame, reason } from "./ai.server";
import { evaluateQuality, type QualityCheck } from "./quality.server";
import { startVideoJob } from "./video.server";
import { asBriefing, sense, TRACTION_THRESHOLDS, type TrendItem } from "./trends.server";
import { pickTemplate, templateBriefing, type ScriptTemplate } from "./script-templates";
import type { QualityGate } from "./quality-config";

export type Slot = "viral" | "general";

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const str = { type: "string" } as const;
const num = { type: "number" } as const;
const strArray = { type: "array", items: str } as const;

const seleccionSchema = obj({
  tema: str,
  angulo: str,
  emocion_objetivo: str,
  puntaje_viral: num,
  vistas_estimadas_del_tema: num,
  por_que_ahora: str,
  ventana_de_oportunidad: str,
  audiencia: str,
  saturacion_competencia: str,
  gancho_tentativo: str,
  promesa_de_valor: str,
  disparador_de_discusion: str,
  datos_verificables: strArray,
  riesgos: strArray,
  descartados: {
    type: "array",
    items: obj({ tema: str, motivo: str, puntaje: num }),
  },
});

const dossierSchema = obj({
  titulo_interno: str,
  promesa_central: str,
  hook: obj({
    voz_en_off: str,
    texto_en_pantalla: str,
    accion_visual: str,
    sonido: str,
    por_que_frena_el_scroll: str,
  }),
  guion: {
    type: "array",
    items: obj({
      desde_seg: num,
      hasta_seg: num,
      voz_en_off: str,
      texto_en_pantalla: str,
      plano: str,
      emocion: str,
    }),
  },
  arquitectura_de_retencion: obj({
    patron_de_corte: str,
    momento_de_giro: str,
    loop_final: str,
    disparador_de_comentarios: str,
  }),
  prompt_maestro_video: str,
  estilo_visual: obj({
    paleta: str,
    grade: str,
    lente: str,
    profundidad: str,
  }),
  subtitulos: obj({
    tipografia: str,
    animacion: str,
    posicion: str,
    contraste: str,
  }),
  planos: {
    type: "array",
    items: obj({
      numero: num,
      duracion_seg: num,
      prompt_generacion: str,
      movimiento_camara: str,
      iluminacion: str,
      angulo: str,
    }),
  },
  audio: obj({
    estilo_de_voz: str,
    musica: str,
    efectos: str,
    ritmo: str,
    mezcla: str,
  }),
  publicacion: obj({
    titulo_youtube: str,
    descripcion_youtube: str,
    tags_youtube: strArray,
    caption_tiktok: str,
    hashtags: strArray,
    mejor_horario_ar: str,
    prompt_miniatura: str,
    texto_miniatura: str,
  }),
  monetizacion: obj({
    angulo_comercial: str,
    llamado_a_la_accion: str,
    riesgo_de_desmonetizacion: str,
  }),
  control_de_calidad: strArray,
});

export interface Seleccion {
  tema: string;
  angulo: string;
  emocion_objetivo: string;
  puntaje_viral: number;
  vistas_estimadas_del_tema: number;
  por_que_ahora: string;
  ventana_de_oportunidad: string;
  audiencia: string;
  saturacion_competencia: string;
  gancho_tentativo: string;
  promesa_de_valor: string;
  disparador_de_discusion: string;
  datos_verificables: string[];
  riesgos: string[];
  descartados: Array<{ tema: string; motivo: string; puntaje: number }>;
}

const ESTRATEGA = `Sos el director creativo de una fábrica de shorts virales de altísimo impacto, pensados para
volverse virales de verdad: se comparten solos. No perseguís la tendencia del día ni el contenido pasajero;
aprovechás toda tu inteligencia, razonamiento y creatividad para construir piezas permanentes de alcance masivo.
Tu público va de los 18 a los 50+ años: el gancho tiene que funcionar en un pibe de 20 y en un padre de 45.
No hagás contenido infantil, no hagás obviedades, no repitas lo que ya está saturado. Pensás como un editor de
tabloide con rigor de investigador: gancho brutal, dato real, giro inesperado, cero relleno. Escribís en español
rioplatense natural, sin argentinismos forzados, pero con vocabulario que entienda cualquiera.`;

const REGLAS_DE_IMPACTO = `Reglas de impacto no negociables:
- Los primeros 3 segundos deciden todo: imagen imposible de ignorar + una frase que abra un bucle mental.
- Una sola idea por short, llevada al extremo. Si hay dos ideas, sobra una.
- Tensión creciente: cada 5 segundos algo tiene que cambiar (dato nuevo, giro, contradicción, revelación).
- Corte visual cada 1,5 a 3 segundos, sin mesetas ni relleno. Ritmo trepidante pero legible.
- Prohibido: saludos, despedidas, "hoy te voy a contar", "dato curioso", pedidos genéricos de suscripción.
- Prohibido repetir frases, ideas o estructuras: cada línea aporta información nueva.
- El texto en pantalla no transcribe la voz: la refuerza con 3 a 6 palabras de golpe, tipografía gigante y legible.
- El cierre deja una pregunta abierta o una afirmación discutible que obliga a comentar o a rebobinar.
- El tema tiene que tener alcance transgeneracional: que lo comparta un adolescente y también su viejo.`;

function fechaHoy(): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

async function seleccionar(slot: Slot, briefing: string): Promise<Seleccion> {
  const consigna =
    slot === "viral"
      ? `Elegí el ángulo de MÁXIMO impacto y alcance masivo entre los pilares permanentes (sexualidad,
 horóscopos, mitos, efemérides, misterios profundos, descubrimientos recientes, psicología, dinero).
 Priorizá el tema que más se va a compartir solo y que funciona de los 18 a los 50+ años. Si el pilar
 está saturado, elegí el ángulo lateral que nadie contó todavía.`
      : `Elegí un tema atemporal de altísima aceptación (mito que todos creen, horóscopo del signo más
 polémico, misterio sin resolver, efeméride de hoy, descubrimiento reciente que cambia lo que sabíamos).
 Prohibido el tono de "dato curioso" blando: tiene que tener la misma tensión y el mismo impacto que una
 revelación de último momento, pero pensado para durar y volverse viral cada vez que se comparte.`;

  return reason<Seleccion>({
    system: ESTRATEGA,
    schemaName: "seleccion",
    schema: seleccionSchema,
    effort: "high",
    prompt: `Fecha: ${fechaHoy()} (zona Argentina).

${consigna}

Método obligatorio de selección (hacelo internamente y devolvé solo el resultado):
1. Armá una lista corta de 6 temas candidatos a partir de los pilares permanentes, buscando ángulos
   con gancho brutal y alcance transgeneracional.
2. Puntuá cada candidato de 0 a 100 con estos pesos: potencia emocional 30, alcance de audiencia (18-50+) 25,
   potencial de discusión y comentarios 20, originalidad del ángulo 15, facilidad de producción en 45-55 segundos 10.
3. Descartá todo tema que dependa de imágenes de archivo imposibles, que sea puro chisme sin dato,
   que ya esté saturado sin ángulo nuevo, o que arriesgue desmonetización.
4. Quedate con el ganador y devolvé los otros cinco como descartados, con motivo y puntaje.

Reglas de tracción no negociables: no elijas un tema que el ranking compuesto marque como
DESCARTAR. Si ningún tema es APTO, cambiá a un ángulo permanente de alto impacto antes que
producir sobre un tema frío (mínimos: ${TRACTION_THRESHOLDS.minFuentes} fuentes, ${TRACTION_THRESHOLDS.minSenales} señales,
puntaje ${TRACTION_THRESHOLDS.minScore}).

Pilares disponibles y señales:
${briefing}

Además del tema ganador, devolvé:
- gancho_tentativo: la frase exacta de los primeros 3 segundos (menos de 22 palabras, golpe mental).
- promesa_de_valor: qué se lleva el espectador si se queda hasta el final.
- disparador_de_discusion: la afirmación o pregunta que va a llenar los comentarios.
- datos_verificables: afirmaciones factuales o basadas en estudios que el guion puede sostener.
- riesgos: reputacionales o de desmonetización.`,
  });
}

async function escribirDossier(
  slot: Slot,
  seleccion: Seleccion,
  template: ScriptTemplate,
  semilla: number,
): Promise<Record<string, unknown>> {
  return reason<Record<string, unknown>>({
    system: ESTRATEGA,
    schemaName: "dossier",
    schema: dossierSchema,
    effort: "high",
    prompt: `Producí el dossier técnico completo de un short vertical 9:16 de 45 a 55 segundos para YouTube
Shorts y TikTok, en español rioplatense, pensado para volverse viral por su propio mérito (se comparte solo).

Tema: ${seleccion.tema}
Ángulo: ${seleccion.angulo}
Emoción objetivo: ${seleccion.emocion_objetivo}
Audiencia: ${seleccion.audiencia}
Gancho de referencia: ${seleccion.gancho_tentativo}
Promesa: ${seleccion.promesa_de_valor}
Disparador de discusión: ${seleccion.disparador_de_discusion}
Franja: ${slot === "viral" ? "impacto masivo permanente" : "interés permanente de alto impacto"}
Datos que se pueden afirmar: ${seleccion.datos_verificables.join(" | ")}
Riesgos a esquivar: ${seleccion.riesgos.join(" | ")}

${REGLAS_DE_IMPACTO}

${templateBriefing(template, semilla)}

REQUISITOS DE PRODUCCIÓN DE ALTA CALIDAD (esto NO es un PowerPoint con audio):
- El video debe sentirse cinematográfico y dinámico: cámara en movimiento constante (push-in, parallax,
  whip-pan, drone, handheld orgánico), profundidad de campo, iluminación con carácter (key + rim light),
  grade de color coherente y paleta cuidada. Cero planos estáticos muertos.
- Audio nítido y llamativo: voz en off cálida y cercana (no robótica), música con gancho que sube de
  intensidad, efectos de sonido que aterrizan cada corte, y un bajo bien definido. El audio tiene que
  invitar a no pausar.
- Subtítulos integrados de forma nativa: tipografía grande, legible, con contraste y animación de entrada
  por palabra o línea; no un bloque plano abajo. El subtítulo es parte del diseño, no un agregado.
- Enfoques visuales dinámicos: cortes cada 1,5 a 2,5 segundos sincronizados con el beat, zooms rápidos,
  transiciones con momentum, splits y PiP solo cuando suman. Ritmo trepidante pero que se entiende.
- Cada plano debe ser visualmente distinto al anterior (ángulo, escala, color, movimiento) para sostener
  la atención hasta el final.

Requisitos estructurales:
- El guion va segundo a segundo, sin huecos ni superposiciones: cada tramo arranca exactamente donde
  termina el anterior, desde 0 hasta la duración final (entre 45 y 55 segundos).
- planos: entre 16 y 22 planos, cada uno con su prompt de generación en inglés técnico, especificando
  ángulo de cámara, movimiento, lente, iluminación y paleta.
- prompt_maestro_video: un único prompt largo, autosuficiente y en inglés técnico, listo para pegar en un
  generador de video por IA de alta calidad. Debe incluir: formato vertical 9:16, duración ~50s, estilo
  visual cinematográfico, paleta, tipo de lente, iluminación con carácter, movimiento de cámara constante,
  ritmo de montaje (corte cada 1,5-2,5s), tratamiento de texto en pantalla animado y referencia de audio
  (voz cálida + música con gancho + SFX por corte).
- La descripción de YouTube y el caption de TikTok tienen que estar escritos para el algoritmo y para el
  humano al mismo tiempo, con las palabras clave del tema al principio.
- control_de_calidad: la lista de verificaciones que este short ya cumple, punto por punto.`,
  });
}

async function corregirDossier(
  dossier: Record<string, unknown>,
  calidad: QualityCheck,
  template: ScriptTemplate,
  semilla: number,
): Promise<Record<string, unknown>> {
  const fallas = [
    ...(calidad.bloqueos ?? []),
    ...(calidad.problemas ?? []).map((p) => `${p.area}: ${p.detalle} → ${p.correccion}`),
  ];

  return reason<Record<string, unknown>>({
    system: ESTRATEGA,
    schemaName: "dossier",
    schema: dossierSchema,
    effort: "high",
    prompt: `El auditor de calidad rechazó este short. Reescribilo entero corrigiendo TODAS las fallas,
sin perder lo que ya funcionaba y sin cambiar de tema.

Fallas a corregir:
${fallas.map((falla) => `- ${falla}`).join("\n")}

${REGLAS_DE_IMPACTO}

${templateBriefing(template, semilla)}

Corregí especialmente el gancho (tiene que ser más brutal y más concreto), la curva de tensión, las
repeticiones y el cierre. Mejorá la producción visual: cámara en movimiento constante, iluminación con
carácter, paleta y grade coherentes, subtítulos animados integrados y audio nítido con música de gancho.
Mantené el guion continuo sin huecos y entre 45 y 55 segundos, con 16 a 22 planos cinematográficos.

Dossier rechazado:
${JSON.stringify(dossier).slice(0, 40_000)}`,
  });
}

async function renderStoryboard(
  runId: string,
  planos: Array<{ numero?: number; prompt_generacion?: string }>,
): Promise<Array<{ numero: number; path: string }>> {
  const seleccionados = planos.slice(0, 6);
  const frames: Array<{ numero: number; path: string }> = [];

  for (const plano of seleccionados) {
    if (!plano.prompt_generacion) continue;
    try {
      const bytes = await generateFrame(
        `${plano.prompt_generacion}. Vertical 9:16 aspect ratio, cinematic short-form video frame, high contrast, professional lighting, shallow depth of field, film grain, 8k quality, no watermark, no captions.`,
      );
      if (!bytes) continue;
      const path = `${runId}/plano-${plano.numero ?? frames.length + 1}.png`;
      const { error } = await supabaseAdmin.storage
        .from("storyboards")
        .upload(path, bytes, { contentType: "image/png", upsert: true });
      if (error) continue;
      frames.push({ numero: plano.numero ?? frames.length + 1, path });
    } catch {
      // un frame fallado no debe tirar abajo la corrida
    }
  }

  return frames;
}

export async function runProduction(
  slot: Slot,
  triggeredBy: string,
  gateOverride?: Partial<QualityGate>,
): Promise<string> {
  const started = Date.now();
  const { data: created, error: createError } = await supabaseAdmin
    .from("runs")
    .insert({ slot, status: "sensing", triggered_by: triggeredBy })
    .select("id")
    .single();

  if (createError || !created) {
    throw new Error(`No se pudo crear la corrida: ${createError?.message ?? "desconocido"}`);
  }

  const runId = created.id;

  try {
    const { items, warnings } = await sense();
    await guardarCandidatos(runId, items);

    await supabaseAdmin.from("runs").update({ status: "analyzing" }).eq("id", runId);
    const seleccion = await seleccionar(slot, asBriefing(items));

    await supabaseAdmin
      .from("runs")
      .update({
        status: "writing",
        topic: seleccion.tema,
        topic_angle: seleccion.angulo,
        emotion: seleccion.emocion_objetivo,
        viral_score: seleccion.puntaje_viral,
      })
      .eq("id", runId);

    const template = pickTemplate(await plantillasRecientes());
    const semilla = Math.floor(Math.random() * 1000);

    let dossier = await escribirDossier(slot, seleccion, template, semilla);
    let calidad = await evaluateQuality(dossier, seleccion.tema, gateOverride);
    let intentos = 1;

    // Hasta dos pasadas de corrección si el checklist bloquea la aprobación.
    while (!calidad.aprobado && intentos < 3) {
      dossier = await corregirDossier(dossier, calidad, template, semilla);
      calidad = await evaluateQuality(dossier, seleccion.tema, gateOverride);
      intentos += 1;
    }

    await supabaseAdmin.from("runs").update({ status: "rendering" }).eq("id", runId);
    const planos = (dossier["planos"] ?? []) as Array<{
      numero?: number;
      prompt_generacion?: string;
    }>;
    const storyboard = await renderStoryboard(runId, planos);

    const masterPrompt = String(dossier["prompt_maestro_video"] ?? "");
    let videoJobId: string | null = null;
    let videoStatus = calidad.aprobado ? "queued" : "blocked";
    let videoError: string | null = null;

    // El video solo se encola si el short pasó el control de calidad.
    if (calidad.aprobado && masterPrompt) {
      try {
        const job = await startVideoJob(videoPrompt(masterPrompt, dossier));
        videoJobId = job.id;
        videoStatus = job.status === "completed" ? "completed" : "in_progress";
      } catch (error) {
        videoStatus = "failed";
        videoError = error instanceof Error ? error.message : "Error al encolar el video";
      }
    }

    await supabaseAdmin
      .from("runs")
      .update({
        status: "done",
        dossier: {
          ...dossier,
          seleccion: { ...seleccion },
          plantilla: { id: template.id, nombre: template.nombre, semilla },
          avisos: warnings,
          intentos_de_calidad: intentos,
        } as never,
        master_prompt: masterPrompt,
        storyboard,
        quality: calidad as never,
        quality_score: Math.round(calidad.puntaje_total ?? 0),
        approved: Boolean(calidad.aprobado),
        video_job_id: videoJobId,
        video_status: videoStatus,
        error: videoError,
        duration_ms: Date.now() - started,
      })
      .eq("id", runId);

    return runId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await supabaseAdmin
      .from("runs")
      .update({ status: "error", error: message, duration_ms: Date.now() - started })
      .eq("id", runId);
    throw error;
  }
}

/** Prompt final para el generador de video, con el gancho al frente. */
export function videoPrompt(masterPrompt: string, dossier: Record<string, unknown>): string {
  const hook = (dossier["hook"] ?? {}) as Record<string, unknown>;
  const onScreen = String(hook["texto_en_pantalla"] ?? "").trim();
  const action = String(hook["accion_visual"] ?? "").trim();
  const visual = (dossier["estilo_visual"] ?? {}) as Record<string, unknown>;
  const subs = (dossier["subtitulos"] ?? {}) as Record<string, unknown>;
  const audio = (dossier["audio"] ?? {}) as Record<string, unknown>;
  return [
    masterPrompt,
    visual["paleta"] ? `Color palette: ${String(visual["paleta"])}.` : "",
    visual["grade"] ? `Color grade: ${String(visual["grade"])}.` : "",
    visual["lente"] ? `Lens: ${String(visual["lente"])}.` : "",
    action ? `Opening shot: ${action}.` : "",
    onScreen
      ? `Animated on-screen subtitles, ${String(subs["tipografia"] ?? "bold condensed sans-serif")}, word-by-word reveal: "${onScreen}".`
      : "",
    audio["musica"]
      ? `Audio: warm voiceover + hook-driven music (${String(audio["musica"])}) + per-cut SFX.`
      : "",
    "Vertical 9:16, constant camera motion (push-in, parallax, whip-pan), fast cuts every 1.5-2.5 seconds, cinematic contrast, shallow depth of field, film grain, no watermark, no letterboxing.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Ids de plantilla usados en las últimas corridas, para no repetir estructura. */
async function plantillasRecientes(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("runs")
    .select("dossier")
    .order("created_at", { ascending: false })
    .limit(4);
  return (data ?? [])
    .map((row) => {
      const dossier = (row.dossier ?? {}) as Record<string, unknown>;
      const plantilla = (dossier["plantilla"] ?? {}) as Record<string, unknown>;
      return typeof plantilla["id"] === "string" ? plantilla["id"] : null;
    })
    .filter((id): id is string => Boolean(id));
}

async function guardarCandidatos(runId: string, items: TrendItem[]): Promise<void> {
  const rows = items.slice(0, 60).map((item) => ({
    run_id: runId,
    title: item.title,
    channel: item.channel,
    views: item.views,
    velocity: item.velocity,
    score: item.velocity ?? item.views,
    source: item.source,
    url: item.url,
  }));
  if (rows.length === 0) return;
  await supabaseAdmin.from("trend_candidates").insert(rows);
}
