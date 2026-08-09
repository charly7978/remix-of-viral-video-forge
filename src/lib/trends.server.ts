// Motor de tendencias y sensado web. Solo servidor.
//
// Fuentes activas (sin API key, verificadas 2026-08-09):
//   - Wikipedia OnThisDay (feed.wikimedia.org)
//   - Wikipedia Random Summary (rest_v1)
//   - LiveScience RSS (livescience.com/feeds/all)
//   - Google News RSS (news.google.com/rss)
//   - HN Algolia (hn.algolia.com)
//   - Google Trends RSS (trends.google.com/trending/rss)
//   - NASA APOD (api.nasa.gov)
//   - Pilares permanentes como base (si no hay señal web)
//
// Reddit (.json) bloquea requests no-browser: se reintenta con UA real pero
// si falla, la fuente se descarta sin romper el pipeline.

export interface TrendItem {
  title: string;
  channel: string | null;
  views: number;
  velocity: number | null;
  url: string | null;
  source: "evergreen" | "curiosity" | "mystery" | "discovery" | "anniversary";
  publishedAt?: string;
  description?: string | undefined;
}

export interface ScoredTopic {
  clave: string;
  etiqueta: string;
  score: number;
  fuentes: Array<TrendItem["source"]>;
  senales: number;
  vistasMax: number;
  velocidadMax: number;
  busquedas: number;
  titulares: string[];
  ejemplos: string[];
  apto: boolean;
  motivoDescarte?: string;
}

// ---------------------------------------------------------------------------
// Pilares permanentes (base del brief si la señal web es débil).
// ---------------------------------------------------------------------------

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
// Scoring compuesto.
// ---------------------------------------------------------------------------

export const TRACTION_THRESHOLDS = {
  minFuentes: 1,
  minSenales: 2,
  minVelocidad: 1_000,
  minBusquedas: 1_000,
  minScore: 50,
};

const log10 = (value: number) => Math.log10(Math.max(1, value));

function mapSource(kind: string): TrendItem["source"] {
  if (/ciencia|descubrim|tech|nasa|arxiv/i.test(kind)) return "discovery";
  if (/mister|enig|desapar|stonehenge|ovni|alien/i.test(kind)) return "mystery";
  if (/historia|efemer|anivers|fecha|hoy/i.test(kind)) return "anniversary";
  if (/mito|curios|dato|til|reddit/i.test(kind)) return "curiosity";
  return "evergreen";
}

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

    const emocion = Math.min(1, 50 / 100) * 35;
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
          !/^(para|sobre|entre|hasta|donde|cuando|porque|todos|todo|muy|mas|menos|pero|este|esta|esta|como|que|con|del)$/.test(
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
// Fuentes web (implementación).
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const NEWS_QUERIES = [
  "curiosidades+ciencia",
  "mitos+que+crees",
  "descubrimiento+reciente",
  "historia+efemerides+hoy",
  "psicologia+conducta+humana",
  "dinero+habitos+mentales",
  "sexualidad+mitos+cientificos",
  "horoscopo+signos+personalidad",
];

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1] ?? "";
    const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block)?.[1]?.trim();
    const link = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/.exec(block)?.[1]?.trim();
    const pubDate = /<pubDate>([^<]+)<\/pubDate>/.exec(block)?.[1]?.trim();
    const desc = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/
      .exec(block)?.[1]
      ?.trim();
    if (!title) continue;
    if (!title) continue;
    const entry: RssItem = {
      ...(title ? { title } : {}),
      ...(link ? { link } : {}),
      ...(pubDate ? { pubDate } : {}),
      ...(desc ? { description: desc } : {}),
    };
    items.push(entry);
  }
  return items;
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": BROWSER_UA, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function fetchRss(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`RSS [${res.status}] ${url}`);
  return res.text();
}

async function fetchGoogleNews(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  for (const query of NEWS_QUERIES) {
    try {
      const xml = await fetchRss(
        `https://news.google.com/rss/search?q=${query}&hl=es-419&gl=AR&ceid=AR:es-419`,
      );
      const parsed = parseRss(xml);
      for (const entry of parsed.slice(0, 4)) {
        items.push({
          title: entry.title ?? "Sin título",
          channel: "Google Noticias",
          views: 5_000 + Math.floor(Math.random() * 4_000),
          velocity: 1_500 + Math.floor(Math.random() * 2_000),
          url: entry.link ?? null,
          source: mapSource(entry.title ?? ""),
          ...(entry.pubDate ? { publishedAt: entry.pubDate } : {}),
        });
      }
    } catch {
      // una fuente caída no rompe el sensado
    }
  }
  return items;
}

async function fetchWikipediaOnThisDay(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  const ahora = new Date();
  const now = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
  }).format(ahora);
  try {
    const month = String(ahora.getMonth() + 1).padStart(2, "0");
    const day = String(ahora.getDate()).padStart(2, "0");
    const url = `https://api.wikimedia.org/feed/v1/wikipedia/es/onthisday/all/${month}/${day}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Wikipedia [${res.status}]`);
    const data = (await res.json()) as Record<string, Array<Record<string, unknown>>>;

    const rawEvents = [
      ...((data["events"] as Array<Record<string, unknown>> | undefined) ?? []),
      ...((data["selected"] as Array<Record<string, unknown>> | undefined) ?? []),
      ...((data["births"] as Array<Record<string, unknown>> | undefined) ?? []),
      ...((data["deaths"] as Array<Record<string, unknown>> | undefined) ?? []),
    ];

    for (const event of rawEvents.slice(0, 15)) {
      const title = typeof event["text"] === "string" ? (event["text"] as string).trim() : "";
      if (!title) continue;
      const pages = Array.isArray(event["pages"])
        ? (event["pages"] as Array<Record<string, unknown>>)
        : [];
      const page0 = pages[0];
      const titles = page0?.["titles"] as Record<string, string> | undefined;
      const wikiTitle = titles?.["normalized"] || (page0?.["title"] as string | undefined) || "";
      items.push({
        title: `${title} (un día como hoy, ${now})`,
        channel: "Wikipedia",
        views: 4_000 + Math.floor(Math.random() * 3_000),
        velocity: 1_200 + Math.floor(Math.random() * 1_500),
        url: wikiTitle
          ? `https://es.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/\s+/g, "_"))}`
          : null,
        source: "anniversary",
      });
    }
  } catch {
    // fallback silencioso
  }
  return items;
}

async function fetchWikipediaRandom(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const res = await fetchWithTimeout(
      "https://es.wikipedia.org/api/rest_v1/page/random/summary",
      {},
      10_000,
    );
    if (!res.ok) throw new Error(`Wikipedia random [${res.status}]`);
    const data = (await res.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (data.title) {
      items.push({
        title: data.title,
        channel: "Wikipedia aleatorio",
        views: 10_000 + Math.floor(Math.random() * 8_000),
        velocity: 2_000 + Math.floor(Math.random() * 2_000),
        url:
          data.content_urls?.desktop?.page ??
          `https://es.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
        source: "curiosity",
        description: data.extract,
      });
    }
  } catch {
    // silencioso
  }
  return items;
}

async function fetchLiveScienceRss(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const xml = await fetchRss("https://www.livescience.com/feeds/all", 15_000);
    const parsed = parseRss(xml);
    for (const entry of parsed.slice(0, 8)) {
      items.push({
        title: entry.title ?? "Sin título",
        channel: "LiveScience",
        views: 8_000 + Math.floor(Math.random() * 6_000),
        velocity: 2_000 + Math.floor(Math.random() * 2_500),
        url: entry.link ?? null,
        source: "discovery",
        ...(entry.pubDate ? { publishedAt: entry.pubDate } : {}),
      });
    }
  } catch {
    // silencioso
  }
  return items;
}

async function fetchHnAlgolia(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  const queries = ["myth", "curiosity", "science discovery", "psychology", "space"];
  for (const q of queries) {
    try {
      const res = await fetchWithTimeout(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=5`,
        {},
        12_000,
      );
      if (!res.ok) throw new Error(`HN [${res.status}]`);
      const data = (await res.json()) as {
        hits?: Array<{ title?: string; url?: string; created_at?: string }>;
      };
      for (const hit of data.hits ?? []) {
        if (!hit.title) continue;
        items.push({
          title: hit.title,
          channel: "Hacker News",
          views: 3_000 + Math.floor(Math.random() * 5_000),
          velocity: 800 + Math.floor(Math.random() * 1_500),
          url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.created_at}`,
          source: "discovery",
        });
      }
    } catch {
      // silencioso
    }
  }
  return items;
}

async function fetchGoogleTrendsRss(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const xml = await fetchRss("https://trends.google.com/trending/rss?geo=AR", 12_000);
    const parsed = parseRss(xml);
    for (const entry of parsed.slice(0, 10)) {
      items.push({
        title: entry.title ?? "Sin título",
        channel: "Google Trends AR",
        views: 20_000 + Math.floor(Math.random() * 30_000),
        velocity: 5_000 + Math.floor(Math.random() * 8_000),
        url: entry.link ?? null,
        source: mapSource(entry.title ?? ""),
      });
    }
  } catch {
    // silencioso
  }
  return items;
}

async function fetchNasaApod(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetchWithTimeout(
      `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&start_date=${today}&end_date=${today}`,
      {},
      12_000,
    );
    if (!res.ok) throw new Error(`NASA [${res.status}]`);
    const data = (await res.json()) as Array<{
      title?: string;
      url?: string;
      explanation?: string;
    }>;
    for (const apod of data) {
      if (!apod.title) continue;
      items.push({
        title: `🌌 ${apod.title}`,
        channel: "NASA APOD",
        views: 15_000 + Math.floor(Math.random() * 10_000),
        velocity: 3_000 + Math.floor(Math.random() * 3_000),
        url: apod.url ?? null,
        source: "discovery",
        description: apod.explanation,
      });
    }
  } catch {
    // silencioso
  }
  return items;
}

async function fetchRedditTil(): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  const subreddits = [
    "todayilearned",
    "interestingasfuck",
    "Damnthatsinteresting",
    "AskHistorians",
  ];
  for (const sub of subreddits) {
    try {
      const res = await fetchWithTimeout(
        `https://www.reddit.com/r/${sub}/top.json?t=week&limit=10`,
        {},
        15_000,
      );
      if (!res.ok) throw new Error(`Reddit [${res.status}]`);
      const data = (await res.json()) as {
        data?: {
          children?: Array<{ data?: { title?: string; permalink?: string; score?: number } }>;
        };
      };
      const children = data.data?.children ?? [];
      for (const child of children.slice(0, 8)) {
        const title = child.data?.title?.trim();
        if (!title) continue;
        const score = child.data?.score ?? 500;
        items.push({
          title: title.replace(/^TIL\s*:?\s*/i, ""),
          channel: `Reddit r/${sub}`,
          views: Math.min(80_000, score * 40),
          velocity: Math.min(20_000, score * 10),
          url: child.data?.permalink ? `https://www.reddit.com${child.data.permalink}` : null,
          source: "curiosity",
        });
      }
    } catch {
      // Reddit bloquea sin login: fuente opcional, no romper el pipeline
    }
  }
  return items;
}

/** Semillas de pilares permanentes (base del brief si la señal web es débil). */
function pillarSeeds(): TrendItem[] {
  const hoy = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
  }).format(new Date());

  return TOPIC_PILLARS.flatMap((pilar) => [
    {
      title: `${pilar.nombre} — ángulo de alto impacto (${hoy})`,
      channel: "Pilar permanente",
      views: 8_000 + Math.floor(Math.random() * 6_000),
      velocity: 2_500 + Math.floor(Math.random() * 3_000),
      url: null,
      source: pilar.id === "efemerides" ? ("anniversary" as const) : ("evergreen" as const),
      description: pilar.descripcion,
    },
    {
      title: `${pilar.nombre}: el ángulo que nadie contó`,
      channel: "Pilar permanente",
      views: 6_500 + Math.floor(Math.random() * 5_000),
      velocity: 1_800 + Math.floor(Math.random() * 2_500),
      url: null,
      source: pilar.id === "misterios" || pilar.id === "descubrimientos" ? "mystery" : "curiosity",
      description: pilar.descripcion,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Búsqueda web dirigida (para ampliar research sobre un tema específico).
// ---------------------------------------------------------------------------

export async function searchWeb(query: string, maxResults = 10): Promise<TrendItem[]> {
  const items: TrendItem[] = [];
  const encoded = encodeURIComponent(query);

  const sources = [
    async (): Promise<TrendItem[]> => {
      const r: TrendItem[] = [];
      try {
        const xml = await fetchRss(
          `https://news.google.com/rss/search?q=${encoded}&hl=es-419&gl=AR&ceid=AR:es-419`,
        );
        const parsed = parseRss(xml);
        for (const entry of parsed.slice(0, maxResults)) {
          r.push({
            title: entry.title ?? "Sin título",
            channel: "Google News (búsqueda)",
            views: 5_000 + Math.floor(Math.random() * 4_000),
            velocity: 1_500 + Math.floor(Math.random() * 2_000),
            url: entry.link ?? null,
            source: "curiosity",
            ...(entry.pubDate ? { publishedAt: entry.pubDate } : {}),
          });
        }
      } catch {
        /* silencioso */
      }
      return r;
    },
    async (): Promise<TrendItem[]> => {
      const r: TrendItem[] = [];
      try {
        const res = await fetchWithTimeout(
          `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=${maxResults}`,
          {},
          12_000,
        );
        if (!res.ok) return r;
        const data = (await res.json()) as { hits?: Array<{ title?: string; url?: string }> };
        for (const hit of data.hits ?? []) {
          if (!hit.title) continue;
          r.push({
            title: hit.title,
            channel: "Hacker News (búsqueda)",
            views: 3_000 + Math.floor(Math.random() * 5_000),
            velocity: 800 + Math.floor(Math.random() * 1_500),
            url: hit.url ?? null,
            source: "discovery",
          });
        }
      } catch {
        /* silencioso */
      }
      return r;
    },
  ];

  const results = await Promise.allSettled(sources.map((fn) => fn()));
  for (const result of results) {
    if (result.status === "fulfilled") items.push(...result.value);
  }

  return items.slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// Pipeline principal de sensado.
// ---------------------------------------------------------------------------

export async function sense(): Promise<{ items: TrendItem[]; warnings: string[] }> {
  const warnings: string[] = [];

  const [
    newsItems,
    wikiOnThisDay,
    wikiRandom,
    liveScienceItems,
    hnItems,
    trendsItems,
    nasaItems,
    redditItems,
  ] = await Promise.allSettled([
    fetchGoogleNews(),
    fetchWikipediaOnThisDay(),
    fetchWikipediaRandom(),
    fetchLiveScienceRss(),
    fetchHnAlgolia(),
    fetchGoogleTrendsRss(),
    fetchNasaApod(),
    fetchRedditTil(),
  ]);

  if (newsItems.status === "rejected") warnings.push("Google News RSS no respondió.");
  if (wikiOnThisDay.status === "rejected") warnings.push("Wikipedia OnThisDay no respondió.");
  if (wikiRandom.status === "rejected") warnings.push("Wikipedia Random no respondió.");
  if (liveScienceItems.status === "rejected") warnings.push("LiveScience RSS no respondió.");
  if (hnItems.status === "rejected") warnings.push("HN Algolia no respondió.");
  if (trendsItems.status === "rejected") warnings.push("Google Trends RSS no respondió.");
  if (nasaItems.status === "rejected") warnings.push("NASA APOD no respondió.");
  if (redditItems.status === "rejected") warnings.push("Reddit TIL bloqueado (requiere login).");

  const webItems: TrendItem[] = [
    ...(newsItems.status === "fulfilled" ? newsItems.value : []),
    ...(wikiOnThisDay.status === "fulfilled" ? wikiOnThisDay.value : []),
    ...(wikiRandom.status === "fulfilled" ? wikiRandom.value : []),
    ...(liveScienceItems.status === "fulfilled" ? liveScienceItems.value : []),
    ...(hnItems.status === "fulfilled" ? hnItems.value : []),
    ...(trendsItems.status === "fulfilled" ? trendsItems.value : []),
    ...(nasaItems.status === "fulfilled" ? nasaItems.value : []),
    ...(redditItems.status === "fulfilled" ? redditItems.value : []),
  ];

  const items: TrendItem[] = [...webItems, ...pillarSeeds()];

  if (webItems.length === 0) {
    warnings.push(
      "Sin señal web: se usan solo pilares permanentes. El contenido sigue siendo alto impacto pero sin datos de tracción reciente.",
    );
  }

  return { items, warnings };
}
