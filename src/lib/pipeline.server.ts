// Orquestador de la producción diaria. Solo servidor.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateFrame, reason } from "./ai.server";
import { asBriefing, sense, type TrendItem } from "./trends.server";

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
  datos_verificables: strArray,
  riesgos: strArray,
  descartados: {
    type: "array",
    items: obj({ tema: str, motivo: str }),
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
  planos: {
    type: "array",
    items: obj({
      numero: num,
      duracion_seg: num,
      prompt_generacion: str,
      movimiento_camara: str,
      iluminacion: str,
    }),
  },
  audio: obj({
    estilo_de_voz: str,
    musica: str,
    efectos: str,
    ritmo: str,
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
  datos_verificables: string[];
  riesgos: string[];
  descartados: Array<{ tema: string; motivo: string }>;
}

const ESTRATEGA = `Sos el director de contenido de una operación comercial de shorts verticales en Argentina.
Tu único objetivo es la retención y las visualizaciones que generan ingresos. No hacés contenido infantil,
no hacés obviedades, no repetís lo que ya está saturado. Pensás como un editor de tabloide con rigor de periodista:
gancho brutal, dato real, cero relleno. Escribís en español rioplatense natural, sin argentinismos forzados.`;

function fechaHoy(): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

async function seleccionar(slot: Slot, briefing: string): Promise<Seleccion> {
  const consigna =
    slot === "viral"
      ? `Elegí EL tema con más visualizaciones y más calor real en Argentina en este momento, priorizando
velocidad de visualizaciones por hora sobre volumen acumulado. Debe ser un tema que todavía tenga
ventana: si ya está exprimido por todos, elegí el ángulo lateral que nadie tocó.`
      : `Elegí un tema de interés general atemporal pero anclado a HOY (efeméride del día, mito, horóscopo,
misterio histórico, dato de ciencia contraintuitivo, curiosidad argentina). Prohibido el tono de
"dato curioso" blando: tiene que tener la misma tensión y el mismo impacto que una nota de último momento.`;

  return reason<Seleccion>({
    system: ESTRATEGA,
    schemaName: "seleccion",
    schema: seleccionSchema,
    effort: "high",
    prompt: `Fecha: ${fechaHoy()} (zona Argentina).

${consigna}

Material sensado en vivo:
${briefing}

Devolvé la selección con puntaje_viral de 0 a 100 (criterio: velocidad, carga emocional, cobertura
mediática, potencial de discusión y facilidad de producción en 45 segundos), las afirmaciones factuales
que el guion podrá sostener, los riesgos reputacionales o de desmonetización, y al menos tres temas
descartados con el motivo exacto del descarte.`,
  });
}

async function escribirDossier(slot: Slot, seleccion: Seleccion): Promise<Record<string, unknown>> {
  return reason<Record<string, unknown>>({
    system: ESTRATEGA,
    schemaName: "dossier",
    schema: dossierSchema,
    effort: "high",
    prompt: `Producí el dossier técnico completo de un short vertical 9:16 de 40 a 55 segundos para YouTube
Shorts y TikTok, en español rioplatense.

Tema: ${seleccion.tema}
Ángulo: ${seleccion.angulo}
Emoción objetivo: ${seleccion.emocion_objetivo}
Audiencia: ${seleccion.audiencia}
Franja: ${slot === "viral" ? "tema caliente del día" : "interés general de alto impacto"}
Datos que se pueden afirmar: ${seleccion.datos_verificables.join(" | ")}
Riesgos a esquivar: ${seleccion.riesgos.join(" | ")}

Reglas duras:
- Los primeros 3 segundos deciden todo: imagen imposible de ignorar + una frase que abra un bucle mental.
- El guion va segundo a segundo, sin huecos, con corte visual cada 1,5 a 3 segundos.
- Nada de "hoy te voy a contar", nada de saludos, nada de despedidas.
- El cierre tiene que empujar el rebobinado o el comentario, no pedir suscripción de manera genérica.
- prompt_maestro_video: un único prompt largo, autosuficiente y en inglés técnico, listo para pegar en un
  generador de video por IA (Sora, Veo, Kling, Runway). Debe incluir formato 9:16, duración, estilo visual,
  paleta, tipo de lente, iluminación, ritmo de montaje, tratamiento de texto en pantalla y referencia de audio.
- planos: entre 12 y 18 planos, cada uno con su prompt de generación en inglés técnico.
- La descripción de YouTube y el caption de TikTok tienen que estar escritos para el algoritmo y para el
  humano al mismo tiempo, con las palabras clave del tema al principio.`,
  });
}

async function renderStoryboard(
  runId: string,
  planos: Array<{ numero?: number; prompt_generacion?: string }>,
): Promise<Array<{ numero: number; path: string }>> {
  const seleccionados = planos.slice(0, 3);
  const frames: Array<{ numero: number; path: string }> = [];

  for (const plano of seleccionados) {
    if (!plano.prompt_generacion) continue;
    try {
      const bytes = await generateFrame(
        `${plano.prompt_generacion}. Vertical 9:16 aspect ratio, cinematic short-form video frame, high contrast, no watermark, no captions.`,
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

export async function runProduction(slot: Slot, triggeredBy: string): Promise<string> {
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

    const dossier = await escribirDossier(slot, seleccion);

    await supabaseAdmin.from("runs").update({ status: "rendering" }).eq("id", runId);
    const planos = (dossier["planos"] ?? []) as Array<{ numero?: number; prompt_generacion?: string }>;
    const storyboard = await renderStoryboard(runId, planos);

    await supabaseAdmin
      .from("runs")
      .update({
        status: "done",
        dossier: { ...dossier, seleccion, avisos: warnings },
        master_prompt: String(dossier["prompt_maestro_video"] ?? ""),
        storyboard,
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
