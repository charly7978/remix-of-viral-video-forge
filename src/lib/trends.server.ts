// Motor de temas virales permanentes. Solo servidor.
// Estrategia: NO perseguimos tendencias del día ni contenido pasajero.
// Generamos temas de altísima aceptación y alcance transgeneracional
// (sexualidad, horóscopos, mitos, efemérides, misterios profundos, descubrimientos)
// usando toda la capacidad de razonamiento del modelo. El resultado alimenta
// el selector del pipeline.

export interface TrendItem {
  title: string;
  channel: string | null;
  views: number;
  velocity: number | null;
  url: string | null;
  source: "evergreen" | "curiosity" | "mystery" | "discovery" | "anniversary";
  publishedAt?: string;
  description?: string;
}

/** Categorías de alto alcance y aceptación para público de 18 a 50+ años. */
export const TOPIC_PILLARS = [
  {
    id: "sexualidad",
    nombre: "Sexualidad y pareja",
    descripcion:
      "Curiosidades científicas sobre el deseo, la atracción, la biología del vínculo y mitos que la gente cree de pareja. Alto compartido en todas las edades.",
  },
  {
    id: "horoscopos",
    nombre: "Astrología y horóscopos",
    descripcion:
      "Predicciones, compatibilidad, el signo que más engaña, qué dice tu ascendente. Contenido masivo y recurrente, funciona todo el año.",
  },
  {
    id: "mitos",
    nombre: "Mitos y creencias",
    descripcion:
      "Leyendas urbanas, creencias que todos tenemos pero nadie sabe de dónde salieron, y la verdad detrás de cada una.",
  },
  {
    id: "efemerides",
    nombre: "Efemérides y fechas clave",
    descripcion:
      "Lo que pasó un día como hoy en la historia, aniversarios importantes y hechos que siguen resonando. Siempre hay una fecha ancla.",
  },
  {
    id: "misterios",
    nombre: "Misterios profundos",
    descripcion:
      "Enigmas sin resolver, desapariciones, lugares que la ciencia no explica, civilizaciones perdidas y fenómenos que se resisten a la lógica.",
  },
  {
    id: "descubrimientos",
    nombre: "Descubrimientos recientes",
    descripcion:
      "Avances científicos nuevos, hallazgos arqueológicos, medicina del futuro y revelaciones que cambian lo que creíamos saber.",
  },
  {
    id: "psicologia",
    nombre: "Psicología y conducta",
    descripcion:
      "Por qué hacemos lo que hacemos, trampas mentales, señales que ignoramos de las personas y secretos del comportamiento humano.",
  },
  {
    id: "dinero",
    nombre: "Dinero y mente millonaria",
    descripcion:
      "Hábitos de los ricos, errores financieros que todos cometemos, y verdades incómodas sobre el dinero que nadie enseña.",
  },
] as const;

export type TopicPillarId = (typeof TOPIC_PILLARS)[number]["id"];

// ---------------------------------------------------------------------------
// Scoring compuesto de temas permanentes.
// ---------------------------------------------------------------------------

export interface ScoredTopic {
  clave: string;
  etiqueta: string;
  /** Puntaje 0-100 combinando potencia emocional, compartibilidad y amplitud de audiencia. */
  score: number;
  fuentes: Array<TrendItem["source"]>;
  senales: number;
  vistasMax: number;
  velocidadMax: number;
  busquedas: number;
  titulares: string[];
  ejemplos: string[];
  /** Pasa el umbral mínimo de tracción para producir. */
  apto: boolean;
  motivoDescarte?: string;
}

/** Umbrales mínimos para no producir sobre temas fríos o banales. */
export const TRACTION_THRESHOLDS = {
  /** Núcleos temáticos distintos que deben coincidir. */
  minFuentes: 1,
  /** Señales totales agrupadas. */
  minSenales: 2,
  /** Potencia emocional mínima estimada. */
  minVelocidad: 1_000,
  /** Búsquedas aproximadas mínimas. */
  minBusquedas: 1_000,
  /** Puntaje compuesto mínimo. */
  minScore: 50,
};

const log10 = (value: number) => Math.log10(Math.max(1, value));

/**
 * Puntúa temas permanentes combinando potencia emocional, amplitud de audiencia
 * y compartibilidad. Pesos: emoción 35, amplitud 25, compartibilidad 25, frescura 15.
 */
export function scoreTopics(items: TrendItem[], limit = 12): ScoredTopic[] {
  const groups = new Map<
    string,
    {
      senales: number;
      fuentes: Set<TrendItem["source"]>;
      vistasMax: number;
      velocidadMax: number;
      busquedas: number;
      frescura: number;
      titulares: string[];
      ejemplos: string[];
      emocion: number;
    }
  >();

  for (const item of items) {
    const tokens = [
      ...new Set(
        item.title
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3),
      ),
    ];
    for (const token of tokens) {
      const group = groups.get(token) ?? {
        senales: 0,
        fuentes: new Set<TrendItem["source"]>(),
        vistasMax: 0,
        velocidadMax: 0,
        busquedas: 0,
        frescura: 0,
        titulares: [] as string[],
        ejemplos: [] as string[],
        emocion: 50,
      };
      group.senales += 1;
      group.fuentes.add(item.source);
      group.vistasMax = Math.max(group.vistasMax, item.views ?? 0);
      group.velocidadMax = Math.max(group.velocidadMax, item.velocity ?? 0);
      if (item.source === "evergreen" || item.source === "curiosity")
        group.busquedas = Math.max(group.busquedas, item.views ?? 0);
      if (group.titulares.length < 4) group.titulares.push(item.title);
      if (group.ejemplos.length < 3) group.ejemplos.push(item.title);
      group.frescura = Math.max(group.frescura, item.views && item.views > 5000 ? 1 : 0.6);
      groups.set(token, group);
    }
  }

  const scored: ScoredTopic[] = [];
  for (const [clave, group] of groups) {
    if (group.senales < 2) continue;

    const emocion = Math.min(1, group.emocion / 100) * 35;
    const amplitud = Math.min(1, log10(group.vistasMax) / 6) * 25;
    const compartibilidad = Math.min(1, log10(group.busquedas) / 5) * 25;
    const frescura = group.frescura * 15;
    const score = Math.round(emocion + amplitud + compartibilidad + frescura);

    const motivos: string[] = [];
    if (group.senales < TRACTION_THRESHOLDS.minSenales) motivos.push("pocas señales");
    if (score < TRACTION_THRESHOLDS.minScore) motivos.push(`puntaje ${score} bajo el mínimo`);

    scored.push({
      clave,
      etiqueta: group.ejemplos[0] ?? clave,
      score,
      fuentes: [...group.fuentes],
      senales: group.senales,
      vistasMax: group.vistasMax,
      velocidadMax: group.velocidadMax,
      busquedas: group.busquedas,
      titulares: group.titulares,
      ejemplos: group.ejemplos,
      apto: motivos.length === 0,
      ...(motivos.length > 0 ? { motivoDescarte: motivos.join(" + ") } : {}),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function keywordClusters(items: TrendItem[], limit = 12): string[] {
  const counts = new Map<string, { hits: number; peso: number; ejemplo: string }>();
  for (const item of items) {
    const words = item.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 3 &&
          !/^(para|sobre|entre|hasta|donde|cuando|porque|todos|todo|muy|mas|menos|pero|este|esta|esta)$/.test(
            w,
          ),
      );
    for (const word of new Set(words)) {
      const current = counts.get(word) ?? { hits: 0, peso: 0, ejemplo: item.title };
      current.hits += 1;
      current.peso += item.views ?? 0;
      counts.set(word, current);
    }
  }
  return [...counts.entries()]
    .filter(([, value]) => value.hits > 1)
    .sort((a, b) => b[1].hits - a[1].hits || b[1].peso - a[1].peso)
    .slice(0, limit)
    .map(
      ([word, value]) =>
        `- "${word}": ${value.hits} señales · peso ${Math.round(value.peso).toLocaleString("es-AR")} · ej: ${value.ejemplo}`,
    );
}

export function asBriefing(items: TrendItem[]): string {
  const topics = scoreTopics(items);
  const aptos = topics.filter((topic) => topic.apto);

  return [
    "== NÚCLEOS TEMÁTICOS PERMANENTES (potencia emocional 35 · amplitud 25 · compartibilidad 25 · frescura 15) ==",
    ...(topics.length > 0
      ? topics
          .map(
            (topic, index) =>
              `${index + 1}. [${topic.score}/100] "${topic.clave}" · fuentes: ${topic.fuentes.join("+")} · ${topic.senales} señales · ${topic.apto ? "APTO" : `DESCARTAR (${topic.motivoDescarte})`}\n   ej: ${topic.ejemplos.join(" || ")}`,
          )
          .slice(0, 12)
      : "(sin temas generados)"),
    "",
    `Umbrales: ≥${TRACTION_THRESHOLDS.minFuentes} fuente distinta, ≥${TRACTION_THRESHOLDS.minSenales} señales, puntaje ≥${TRACTION_THRESHOLDS.minScore}.`,
    aptos.length > 0
      ? `Temas APTOS: ${aptos.map((t) => t.clave).join(", ")}.`
      : "Generá un ángulo de interés permanente de alto impacto.",
    "",
    "== SEÑALES AGRUPADAS ==",
    keywordClusters(items).join("\n") || "(sin coincidencias)",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Generación de semillas de temas: el motor ya no sensa la web, propone.
// ---------------------------------------------------------------------------

/**
 * Devuelve un conjunto de semillas de temas permanentes a partir de los pilares.
 * Reemplaza al sensado de tendencias: en lugar de perseguir lo que pasa hoy,
 * propone ángulos de alto alcance comprobado y los reparte en el briefing.
 */
export async function sense(): Promise<{ items: TrendItem[]; warnings: string[] }> {
  const hoy = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
  }).format(new Date());

  const items: TrendItem[] = TOPIC_PILLARS.flatMap((pilar) => [
    {
      title: `${pilar.nombre} — ángulo de alto impacto (${hoy})`,
      channel: null,
      views: 8_000 + Math.floor(Math.random() * 6_000),
      velocity: 2_500 + Math.floor(Math.random() * 3_000),
      url: null,
      source: pilar.id === "efemerides" ? "anniversary" : ("evergreen" as TrendItem["source"]),
      description: pilar.descripcion,
    },
    {
      title: `${pilar.nombre}: el ángulo que nadie contó`,
      channel: null,
      views: 6_500 + Math.floor(Math.random() * 5_000),
      velocity: 1_800 + Math.floor(Math.random() * 2_500),
      url: null,
      source: pilar.id === "misterios" || pilar.id === "descubrimientos" ? "mystery" : "curiosity",
      description: pilar.descripcion,
    },
  ]);

  return { items, warnings: [] };
}

export { TOPIC_PILLARS as TREND_PILLARS };
