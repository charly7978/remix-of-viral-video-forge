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
    const words = item.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !VACIAS.has(word));
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

export function asBriefing(items: TrendItem[]): string {
  const bySource = (source: TrendItem["source"]) => items.filter((item) => item.source === source);

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
