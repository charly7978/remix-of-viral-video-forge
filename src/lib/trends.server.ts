// Sensado de tendencias reales de Argentina. Solo servidor.

export interface TrendItem {
  title: string;
  channel: string | null;
  views: number;
  velocity: number | null;
  score: number;
  source: "youtube" | "google_trends" | "news";
  source_weight: number;
  url: string | null;
  publishedAt?: string;
  description?: string;
}

const YT_API = "https://www.googleapis.com/youtube/v3";

function hoursSince(iso: string | undefined): number {
  if (!iso) return 24;
  const diff = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return diff > 0.5 ? diff : 0.5;
}

function sourceWeight(source: TrendItem["source"]): number {
  switch (source) {
    case "youtube":
      return 1.4;
    case "google_trends":
      return 1.1;
    case "news":
      return 0.9;
  }
}

function scoreYouTube(views: number, velocity: number): number {
  return Math.round(velocity * 0.7 + views * 0.05 + Math.log10(Math.max(views, 1)) * 10);
}

function scoreRss(traffic: number, source: TrendItem["source"]): number {
  return Math.round(traffic * (source === "google_trends" ? 0.8 : 0.5));
}

function buildTrendItem(item: Omit<TrendItem, "score">): TrendItem {
  return {
    ...item,
    score: Math.round(item.source_weight * (item.velocity ?? item.views) + (item.velocity ?? 0) * 0.15),
  };
}

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
      const velocity = Math.round(views / hoursSince(item.snippet.publishedAt));
      return buildTrendItem({
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        views,
        velocity,
        source: "youtube",
        source_weight: sourceWeight("youtube"),
        url: `https://www.youtube.com/watch?v=${item.id}`,
        publishedAt: item.snippet.publishedAt,
        description: item.snippet.description.slice(0, 400),
      });
    })
    .filter((item) => item.views > 0)
    .sort((a, b) => b.score - a.score);
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
    const score = scoreRss(traffic, source);
    items.push({
      title: decodeEntities(titleMatch[1] ?? ""),
      channel: null,
      views: traffic,
      velocity: null,
      score,
      source,
      source_weight: sourceWeight(source),
      url: linkMatch?.[1] ? decodeEntities(linkMatch[1]) : null,
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

  const items = [...youtube, ...trends, ...news].sort((a, b) => b.score - a.score);
  return { items, warnings };
}

export function asBriefing(items: TrendItem[]): string {
  const bySource = (source: TrendItem["source"]) =>
    items
      .filter((item) => item.source === source)
      .slice(0, 30)
      .map((item, index) => {
        const score = `score ${item.score}`;
        if (source === "youtube") {
          return `${index + 1}. [${item.views.toLocaleString("es-AR")} vistas | ${(item.velocity ?? 0).toLocaleString("es-AR")} vistas/h | ${score}] ${item.title} — ${item.channel}`;
        }
        return `${index + 1}. [${score}] ${item.title}${item.views ? ` (~${item.views.toLocaleString("es-AR")} estimado)` : ""}`;
      });

  const yt = bySource("youtube").join("\n");
  const gt = bySource("google_trends").join("\n");
  const nw = bySource("news").join("\n");

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
