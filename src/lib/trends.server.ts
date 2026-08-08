// Sensado de tendencias reales de Argentina. Solo servidor.

export interface TrendItem {
  title: string;
  channel: string | null;
  views: number;
  velocity: number | null;
  url: string | null;
  source: "youtube" | "google_trends" | "news";
  publishedAt?: string;
  description?: string;
}

const YT_API = "https://www.googleapis.com/youtube/v3";

function hoursSince(iso: string | undefined): number {
  if (!iso) return 24;
  const diff = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return diff > 0.5 ? diff : 0.5;
}

/** Videos en tendencia en Argentina, ordenados por velocidad de visualizaciones. */
export async function fetchYouTubeTrending(): Promise<TrendItem[]> {
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key) return [];

  const params = new URLSearchParams({
    part: "snippet,statistics",
    chart: "mostPopular",
    regionCode: "AR",
    maxResults: "50",
    key,
  });

  const response = await fetch(`${YT_API}/videos?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API [${response.status}]: ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      snippet: { title: string; channelTitle: string; publishedAt: string; description: string };
      statistics: { viewCount?: string };
    }>;
  };

  return (data.items ?? [])
    .map((item) => {
      const views = Number(item.statistics.viewCount ?? 0);
      return {
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        views,
        velocity: Math.round(views / hoursSince(item.snippet.publishedAt)),
        url: `https://www.youtube.com/watch?v=${item.id}`,
        source: "youtube" as const,
        publishedAt: item.snippet.publishedAt,
        description: item.snippet.description.slice(0, 400),
      };
    })
    .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0));
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRss(xml: string, source: TrendItem["source"], limit: number): TrendItem[] {
  const items: TrendItem[] = [];
  const blocks = xml.split("<item>").slice(1);
  for (const block of blocks.slice(0, limit)) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const trafficMatch = block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/);
    if (!titleMatch) continue;
    const traffic = trafficMatch?.[1]
      ? Number(decodeEntities(trafficMatch[1]).replace(/[^\d]/g, ""))
      : 0;
    items.push({
      title: decodeEntities(titleMatch[1] ?? ""),
      channel: null,
      views: traffic,
      velocity: null,
      url: linkMatch?.[1] ? decodeEntities(linkMatch[1]) : null,
      source,
    });
  }
  return items;
}

async function safeRss(url: string, source: TrendItem["source"], limit: number): Promise<TrendItem[]> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TrendRadarAR/1.0)" },
    });
    if (!response.ok) return [];
    return parseRss(await response.text(), source, limit);
  } catch {
    return [];
  }
}

/** Búsquedas explosivas del día en Argentina. */
export function fetchGoogleTrends(): Promise<TrendItem[]> {
  return safeRss("https://trends.google.com/trending/rss?geo=AR", "google_trends", 20);
}

/** Titulares del día en Argentina, para contexto y verificación. */
export function fetchNews(): Promise<TrendItem[]> {
  return safeRss(
    "https://news.google.com/rss?hl=es-419&gl=AR&ceid=AR:es-419",
    "news",
    25,
  );
}

export async function sense(): Promise<{ items: TrendItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const [youtube, trends, news] = await Promise.all([
    fetchYouTubeTrending().catch((error: unknown) => {
      warnings.push(`YouTube: ${error instanceof Error ? error.message : "error"}`);
      return [] as TrendItem[];
    }),
    fetchGoogleTrends(),
    fetchNews(),
  ]);

  if (youtube.length === 0) {
    warnings.push(
      "Sin datos de YouTube: falta la clave YOUTUBE_API_KEY o la cuota diaria está agotada.",
    );
  }

  return { items: [...youtube, ...trends, ...news], warnings };
}

const VACIAS = new Set([
  "para","como","sobre","desde","este","esta","esto","entre","hasta","donde","cuando","porque","quien",
  "todos","todo","muy","mas","menos","pero","unos","unas","luego","ante","tras","segun","contra","cada",
  "the","and","with","that","este","aquel","fue","son","por","con","los","las","del","una","uno","que",
  "argentina","video","shorts","short","oficial","vivo","hoy",
]);

/** Agrupa las señales por palabra clave para exponer qué hecho concentra el calor real. */
export function keywordClusters(items: TrendItem[], limit = 12): string[] {
  const counts = new Map<string, { hits: number; peso: number; ejemplo: string }>();
  for (const item of items) {
    const words = tokenize(item.title);
    for (const word of new Set(words)) {
      const current = counts.get(word) ?? { hits: 0, peso: 0, ejemplo: item.title };
      current.hits += 1;
      current.peso += item.velocity ?? item.views ?? 0;
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

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !VACIAS.has(word));
}

// ---------------------------------------------------------------------------
// Scoring compuesto de temas: combina YouTube + Google Trends + noticias.
// ---------------------------------------------------------------------------

export interface ScoredTopic {
  clave: string;
  etiqueta: string;
  /** Puntaje 0-100 combinando tracción, velocidad, corroboración y frescura. */
  score: number;
  fuentes: Array<TrendItem["source"]>;
  senales: number;
  vistasMax: number;
  velocidadMax: number;
  busquedas: number;
  titulares: string[];
  ejemplos: string[];
  /** Pasa el umbral mínimo de tracción para Argentina. */
  apto: boolean;
  motivoDescarte?: string;
}

/** Umbrales de tracción mínima para no producir sobre temas fríos. */
export const TRACTION_THRESHOLDS = {
  /** Fuentes distintas que deben mencionar el tema. */
  minFuentes: 2,
  /** Señales totales agrupadas. */
  minSenales: 3,
  /** Velocidad mínima de visualizaciones por hora en YouTube AR. */
  minVelocidad: 3_000,
  /** Búsquedas aproximadas mínimas en Google Trends AR. */
  minBusquedas: 2_000,
  /** Puntaje compuesto mínimo. */
  minScore: 45,
};

const log10 = (value: number) => Math.log10(Math.max(1, value));

/**
 * Puntúa temas agrupando señales por bigramas/palabras clave y cruzando fuentes.
 * Pesos: velocidad 30, volumen 20, corroboración cruzada 25, búsquedas 15, frescura 10.
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
    }
  >();

  for (const item of items) {
    const tokens = [...new Set(tokenize(item.title))];
    for (const token of tokens) {
      const group =
        groups.get(token) ??
        {
          senales: 0,
          fuentes: new Set<TrendItem["source"]>(),
          vistasMax: 0,
          velocidadMax: 0,
          busquedas: 0,
          frescura: 0,
          titulares: [] as string[],
          ejemplos: [] as string[],
        };
      group.senales += 1;
      group.fuentes.add(item.source);
      group.vistasMax = Math.max(group.vistasMax, item.views ?? 0);
      group.velocidadMax = Math.max(group.velocidadMax, item.velocity ?? 0);
      if (item.source === "google_trends") group.busquedas = Math.max(group.busquedas, item.views ?? 0);
      if (item.source === "news" && group.titulares.length < 4) group.titulares.push(item.title);
      if (group.ejemplos.length < 3) group.ejemplos.push(item.title);
      const horas = hoursSince(item.publishedAt);
      group.frescura = Math.max(group.frescura, horas <= 12 ? 1 : horas <= 36 ? 0.6 : 0.3);
      groups.set(token, group);
    }
  }

  const scored: ScoredTopic[] = [];
  for (const [clave, group] of groups) {
    if (group.senales < 2) continue;

    const velocidad = Math.min(1, log10(group.velocidadMax) / 6) * 30;
    const volumen = Math.min(1, log10(group.vistasMax) / 7) * 20;
    const cruce = Math.min(1, (group.fuentes.size - 1) / 2) * 25;
    const busquedas = Math.min(1, log10(group.busquedas) / 5) * 15;
    const frescura = group.frescura * 10;
    const score = Math.round(velocidad + volumen + cruce + busquedas + frescura);

    const motivos: string[] = [];
    if (group.fuentes.size < TRACTION_THRESHOLDS.minFuentes) motivos.push("una sola fuente");
    if (group.senales < TRACTION_THRESHOLDS.minSenales) motivos.push("pocas señales");
    if (
      group.velocidadMax < TRACTION_THRESHOLDS.minVelocidad &&
      group.busquedas < TRACTION_THRESHOLDS.minBusquedas
    ) {
      motivos.push("baja tracción en Argentina");
    }
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

function scoredBlock(topics: ScoredTopic[]): string {
  if (topics.length === 0) return "(sin temas con tracción suficiente)";
  return topics
    .map(
      (topic, index) =>
        `${index + 1}. [${topic.score}/100] "${topic.clave}" · fuentes: ${topic.fuentes.join("+")} · ${topic.senales} señales · ${topic.velocidadMax.toLocaleString("es-AR")} vistas/h · ~${topic.busquedas.toLocaleString("es-AR")} búsquedas · ${topic.apto ? "APTO" : `DESCARTAR (${topic.motivoDescarte})`}\n   ej: ${topic.ejemplos.join(" || ")}`,
    )
    .join("\n");
}

export function asBriefing(items: TrendItem[]): string {
  const bySource = (source: TrendItem["source"]) => items.filter((item) => item.source === source);
  const topics = scoreTopics(items);
  const aptos = topics.filter((topic) => topic.apto);

  const yt = bySource("youtube")
    .slice(0, 30)
    .map(
      (item, index) =>
        `${index + 1}. [${item.views.toLocaleString("es-AR")} vistas | ${(item.velocity ?? 0).toLocaleString("es-AR")} vistas/h] ${item.title} — ${item.channel}`,
    )
    .join("\n");
  const gt = bySource("google_trends")
    .map((item) => `- ${item.title}${item.views ? ` (~${item.views.toLocaleString("es-AR")} búsquedas)` : ""}`)
    .join("\n");
  const nw = bySource("news")
    .map((item) => `- ${item.title}`)
    .join("\n");

  return [
    "== RANKING COMPUESTO DE TEMAS (velocidad 30 · volumen 20 · cruce de fuentes 25 · búsquedas 15 · frescura 10) ==",
    scoredBlock(topics),
    "",
    `Umbrales de tracción para Argentina: ≥${TRACTION_THRESHOLDS.minFuentes} fuentes distintas, ≥${TRACTION_THRESHOLDS.minSenales} señales, ≥${TRACTION_THRESHOLDS.minVelocidad.toLocaleString("es-AR")} vistas/h o ≥${TRACTION_THRESHOLDS.minBusquedas.toLocaleString("es-AR")} búsquedas, puntaje ≥${TRACTION_THRESHOLDS.minScore}.`,
    aptos.length > 0
      ? `Temas APTOS (elegí de acá salvo que ninguno sirva): ${aptos.map((t) => t.clave).join(", ")}.`
      : "Ningún tema alcanzó el umbral: elegí interés general de alto impacto en lugar de forzar un tema frío.",
    "",
    "== SEÑALES AGRUPADAS / DÓNDE ESTÁ EL CALOR REAL ==",
    keywordClusters(items).join("\n") || "(sin coincidencias)",
    "",
    "== YOUTUBE ARGENTINA / MÁS VISTOS AHORA ==",
    yt || "(sin datos)",
    "",
    "== GOOGLE TRENDS ARGENTINA / BÚSQUEDAS EXPLOSIVAS ==",
    gt || "(sin datos)",
    "",
    "== TITULARES DEL DÍA (ARGENTINA) ==",
    nw || "(sin datos)",
  ].join("\n");
}

