# Radar Viral AR — Codebase Overview

## Resumen

**Radar Viral AR** (repositorio: `remix-of-viral-video-forge`) es una aplicación web full-stack construida con **TanStack Start** (React 19) que automatiza la producción de shorts virales para YouTube Shorts y TikTok orientados a Argentina. Dos veces al día (vía disparador externo como n8n o pg_cron) sensa tendencias reales (YouTube API, Google Trends RSS, Google News RSS), un agente de IA selecciona el tema más caliente, otro agente genera un dossier técnico completo (gancho, guion segundo a segundo, planos, prompt maestro para generadores de video, metadatos de publicación), se renderizan frames de storyboard y un video final, y todo se persiste en Supabase para su visualización en un dashboard tipo "mesa de operaciones".

El proyecto fue generado por **Lovable** y está conectado a su infraestructura de créditos a través del gateway de IA (`ai.gateway.lovable.dev`).

---

## Contexto del pedido del usuario

El usuario solicitó dos cambios estructurales:

1. **Eliminar el logueo inicial** — la app debe entrar directo al dashboard sin pasar por `/auth`.
2. **Eliminar el sistema de créditos de Lovable** — reemplazar la integración con el gateway de Lovable por integración de IA **gratuita** (API keys directas o free tiers) sin bajar calidad, robusteciendo el sistema.

Este documento documenta el estado actual como base para esos cambios. Las secciones **"Cambios requeridos"** al final detallan exactamente qué tocar.

---

## Arquitectura

### Patrón general

- **Full-stack SSR con TanStack Start** (file-based routing). El servidor corre con **Nitro** (via Vite plugin de Lovable) y el cliente es React 19 con React Query.
- **Arquitectura en capas**:
  - **Rutas clientes** (`src/routes/*.tsx`) — UI del dashboard.
  - **Server Functions** (`src/lib/runs.functions.ts`) — puente RPC entre cliente y servidor, protegidas por autenticación.
  - **Módulos server-only** (`src/lib/*.server.ts`) — orquestación del pipeline, sensado de tendencias, llamadas de IA.
  - **Integraciones** (`src/integrations/supabase/*`) — clientes Supabase (público, admin con service role, y middleware de auth).
- **Base de datos**: Supabase (PostgreSQL) + Storage (buckets `storyboards` y `videos`).
- **IA**: Toda la IA pasa por el gateway de Lovable (`https://ai.gateway.lovable.dev/v1`) usando la API key `LOVABLE_API_KEY`. No hay llamadas directas a ningún proveedor.

### Stack tecnológico

| Capa        | Tecnología                                                                  |
| ----------- | --------------------------------------------------------------------------- |
| Runtime     | Node.js + Bun (bun.lock, bunfig.toml)                                       |
| Framework   | TanStack Start 1.168, TanStack Router 1.170, TanStack Query 5.101           |
| UI          | React 19, shadcn/ui (Radix), Tailwind CSS 4, lucide-react, sonner, recharts |
| Backend SSR | Nitro 3.0 beta (build target Cloudflare)                                    |
| DB/BaaS     | Supabase (supabase-js 2.112)                                                |
| IA          | Gateway Lovable (`openai/gpt-5.6-sol`, `google/gemini-3.1-flash-image`)     |
| Validación  | zod 3.24                                                                    |
| Build       | Vite 8 + plugin `@lovable.dev/vite-tanstack-config`                         |

### Entrada y arranque

1. `vite.config.ts` usa `defineConfig` de `@lovable.dev/vite-tanstack-config` (configura TanStack Start, React, Tailwind, alias `@`, nitro).
2. El server entry apunta a `src/server.ts` → wrapper de errores SSR catastróficos → importa `@tanstack/react-start/server-entry`.
3. `src/start.ts` crea la instancia de TanStack Start con:
   - `functionMiddleware: [attachSupabaseAuth]` — adjunta el Bearer token del usuario a las serverFn desde el cliente.
   - `requestMiddleware: [errorMiddleware, csrfMiddleware]` — captura errores SSR y protege de CSRF.
4. El router se crea en `src/router.tsx` con `routeTree.gen.ts` (generado automáticamente).

### Flujo de ejecución principal (producción de un video)

```
Dashboard (botón "Producir ahora")
  → useServerFn(startRun)              [src/lib/runs.functions.ts]
  → middleware requireSupabaseAuth      [src/integrations/supabase/auth-middleware.ts]
  → runProduction(slot, "manual")       [src/lib/pipeline.server.ts]
  →         1. INSERT en runs (status: sensing)
  →         2. sense()                   [src/lib/trends.server.ts]
  →         3. INSERT trend_candidates (hasta 60)
  →         4. seleccionar(slot, briefing) → reason() [IA]
  →         5. UPDATE runs (status: writing, topic, angle...)
  →         6. escribirDossier(slot, seleccion) → reason() [IA]
  →         7. reviewDossier(dossier) → reason() [IA] (QA)
  →         8. UPDATE runs (status: rendering)
  →         9. renderStoryboard(runId, planos) → generateFrame() ×3 [IA imagen] → Storage
  →        10. renderVideo(runId, masterPrompt) → generateVideo() [IA video] → Storage
  →        11. UPDATE runs (status: done, dossier, video_url, duration_ms)
  → si falla → UPDATE runs (status: error, error: msg)
```

### Disparo programado (2 veces/día)

No hay cron interno. Existe un endpoint público **`POST /api/public/hooks/produce`** (`src/routes/api/public/hooks/produce.ts`) diseñado para ser llamado por **n8n**, pg_cron o cualquier scheduler. Se autentica con el header `x-scheduler-secret` o `apikey` comparado contra `SCHEDULER_HOOK_SECRET`. Body opcional: `{ "slot": "viral" | "general" }` (default: `viral`). Llama `runProduction(slot, "programado")`.

---

## Estructura de directorios

```
remix-of-viral-video-forge/
├── .env                          — credenciales Supabase (publishable, URL)
├── AGENTS.md                     — aviso de Lovable: no reescribir historial git
├── bunfig.toml                   — guardia de supply-chain 24h (bun)
├── components.json               — config shadcn/ui
├── package.json                  — deps + scripts (dev/build/lint/format)
├── vite.config.ts                — configura TanStack Start (server entry: "server")
├── supabase/
│   └── config.toml               — solo project_id (mgjcnubvqqfibxfhgknw)
├── public/
│   ├── favicon.ico
│   └── robots.txt
└── src/
    ├── start.ts                  — instancia TanStack Start + middlewares globales
    ├── server.ts                 — server entry: wrapper de errores SSR (h3)
    ├── router.tsx                — crea el router con QueryClient
    ├── routeTree.gen.ts          — GENERADO, no editar
    ├── styles.css                — tema oscuro "mesa de operaciones" (oklch, tailwind 4)
    ├── components/
    │   └── ui/                   — ~45 componentes shadcn/ui (button, badge, tabs, sonner...)
    ├── hooks/
    │   ├── use-mobile.tsx        — hook de breakpoint 768px
    │   └── use-session.ts        — estado de sesión Supabase (cliente)
    ├── integrations/
    │   └── supabase/
    │       ├── client.ts         — cliente Supabase público (proxy lazy, soporta nuevas API keys)
    │       ├── client.server.ts  — cliente admin con SERVICE_ROLE (bypass RLS)
    │       ├── auth-attacher.ts  — middleware cliente: adjunta Bearer token a serverFns
    │       ├── auth-middleware.ts— middleware servidor: valida JWT (requiere sesión)
    │       └── types.ts          — tipos generados de la DB
    ├── lib/
    │   ├── ai.server.ts          — ⭐ integración IA vía gateway Lovable (reason, generateFrame, generateVideo)
    │   ├── pipeline.server.ts    — ⭐ orquestador runProduction (estados, dossier, storyboard, video)
    │   ├── trends.server.ts      — ⭐ sensado: YouTube API, Google Trends RSS, Google News RSS
    │   ├── runs.functions.ts     — server functions: listRuns, getRun, startRun, deleteRun
    │   ├── error-capture.ts      — captura errores fuera de banda para server.ts
    │   ├── error-page.ts         — HTML de error 500 genérico
    │   ├── lovable-error-reporting.ts — telemetría hacia el editor Lovable
    │   └── utils.ts              — cn() (clsx + tailwind-merge)
    └── routes/
        ├── __root.tsx            — layout raíz (QueryClientProvider, Toaster, Head/Scripts)
        ├── index.tsx             — dashboard principal (requiere sesión)
        ├── auth.tsx              — página de login/signup (Supabase Auth)
        ├── corrida.$runId.tsx    — detalle de corrida (dossier, planos, video, candidatos)
        ├── README.md             — convenciones de rutas TanStack
        └── api/
            └── public/
                └── hooks/
                    └── produce.ts — webhook público para scheduler externo (n8n)
```

---

## Abstracciones clave

### `src/lib/ai.server.ts` — Capa de IA (⭐ el punto #2 del pedido)

- **Responsabilidad**: Único punto de contacto con la IA. Envuelve el gateway de Lovable.
- **`reason<T>({system, prompt, schemaName, schema, effort, model})`**: llamada de razonamiento con **salida estructurada JSON** usando el endpoint `/responses` del gateway con `stream: true` y `text.format.type: "json_schema"`. El schema se valida del lado del gateway (`strict: true`). El streaming es **obligatorio** porque una corrida puede superar los 2 minutos y una respuesta bufferizada se cortaría (comentario en el código). Modelo default: `openai/gpt-5.6-sol`, effort default `medium`.
- **`generateFrame(prompt)`**: genera imagen vía `/chat/completions` con `google/gemini-3.1-flash-image` y `modalities: ["image","text"]`. Devuelve `Uint8Array` (decodifica base64 de data URL).
- **`generateVideo(prompt)`**: genera video vía `/responses` con `modalities: ["video"]`, `video: { format: "mp4", aspect_ratio: "9:16", duration: 45, quality: "high" }`. Extrae URL del video de múltiples formatos de respuesta posibles (búsqueda defensiva en `extractVideoUrl`).
- **Dependencia crítica**: `process.env["LOVABLE_API_KEY"]` — si falta, lanza error. **Todo el consumo de IA del sistema pasa por esta única función**, por lo que reemplazar el gateway por proveedores gratuitos implica reescribir solo este archivo (y ajustar `pipeline.server.ts`).
- **Uso**: `runProduction` en `pipeline.server.ts` (selección de tema, dossier, QA) y `renderStoryboard`/`renderVideo`.

### `src/lib/pipeline.server.ts` — Orquestador (⭐ el corazón del sistema)

- **Responsabilidad**: Ejecuta la corrida completa de producción de un short.
- **`runProduction(slot, triggeredBy)`**: crea el registro `runs`, itera por los estados `sensing → analyzing → writing → rendering → done` (o `error`), persistendo cada avance. Actualiza las tablas `runs` y `trend_candidates`. Renderiza storyboard (3 frames) y video final, subiéndolos a Storage.
- **Schemas JSON**: `seleccionSchema` (tema, ángulo, emoción, puntaje 0-100, vistas estimadas, ventana de oportunidad, descartados con motivo) y `dossierSchema` (gancho, guion segundo a segundo, arquitectura de retención, prompt maestro, 12-18 planos, audio, publicación, monetización, control de calidad). Ambos se pasan al gateway para salida estructurada estricta.
- **Prompts**: `ESTRATEGA` (system) — director de contenido comercial, español rioplatense, "gancho brutal, dato real, cero relleno". Reglas duras: primeros 3 segundos decisivos, cortes visuales cada 1.5-3s, sin saludos, cierre que empuje rebobinado/comentario.
- **Tolerancia a fallos**: un frame fallido no tira la corrida (try/catch por frame); el video fallido deja `video_url: null` pero la corrida queda `done`.
- **Uso**: server function `startRun` y webhook `produce.ts`.

### `src/lib/trends.server.ts` — Sensado de tendencias

- **Responsabilidad**: Recopila tendencias reales de Argentina desde 3 fuentes en paralelo con `Promise.all`.
- **`fetchYouTubeTrending()`**: YouTube Data API v3 (`chart=mostPopular`, `regionCode=AR`, 50 videos). Calcula `velocity = views / horasDesdePublicación`. Requiere `YOUTUBE_API_KEY` (si falta, devuelve `[]` y agrega warning).
- **`fetchGoogleTrends()`**: RSS público `https://trends.google.com/trending/rss?geo=AR` (20 items, parsea `ht:approx_traffic`).
- **`fetchNews()`**: RSS Google News Argentina (25 titulares, es-419).
- **Scoring**: YouTube pondera 1.4, Trends 1.1, News 0.9. `buildTrendItem` combina views, velocity y score. `sense()` junta todo, ordena por score y devuelve warnings (e.g., cuota YouTube agotada).
- **`asBriefing()`**: formatea los top-30 de cada fuente en texto legible para el prompt del agente IA.
- **Tolerancia a fallos**: cada fuente se captura individualmente; YouTube falla → warning, las otras siguen.

### `src/lib/runs.functions.ts` — Server Functions (API RPC)

- **Responsabilidad**: Puente seguro entre el dashboard y la lógica server.
- **`listRuns`** (GET): listado de últimas 60 corridas. Middleware: `requireSupabaseAuth`.
- **`getRun`** (POST): detalle completo de una corrida + candidatos + URLs firmadas de storage (frames y video, expiran a 1 hora). Middleware: `requireSupabaseAuth`.
- **`startRun`** (POST): valida `slot` con zod, importa dinámicamente `pipeline.server` y ejecuta `runProduction`. Middleware: `requireSupabaseAuth`.
- **`deleteRun`** (POST): borra una corrida. Middleware: `requireSupabaseAuth`.
- **Importante para el punto #1**: si se elimina el login, estos middlewares hay que sacarlos o reemplazarlos por un open-access middleware.

### `src/integrations/supabase/auth-middleware.ts` — Middleware de autenticación (⭐ a eliminar/ajustar para el punto #1)

- `requireSupabaseAuth`: valida el header `Authorization: Bearer <token>` (formato JWT de 3 partes), verifica claims con `supabase.auth.getClaims(token)` y expone `context.supabase` (cliente autenticado) + `context.userId` + `context.claims` a los handlers.
- Extensiones Lovable: soporta las **nuevas API keys** (`sb_publishable_*`, `sb_secret_*`) — quita el header Authorization si coincide con la key en el fetch wrapper.
- **Archivos generados** que dicen "This file is automatically generated. Do not edit it directly": `client.ts`, `client.server.ts`, `auth-attacher.ts`, `auth-middleware.ts`, `types.ts`. Editar con cuidado (Lovable los regeneraría).

### `src/hooks/use-session.ts` — Sesión cliente

- Escucha `supabase.auth.onAuthStateChange` + `getSession()`. Expone `{ session, loading }`. Todas las rutas del dashboard lo usan para redirigir a `/auth` si no hay sesión.

### `src/routes/index.tsx` — Dashboard

- Métricas (corridas, puntaje viral medio, último tema caliente, duración), dos LaunchCards ("Tema del momento" / "Interés general") que llaman `startRun`, historial con polling cada 15s (`refetchInterval: 15_000`), y botón **"Salir"** (`supabase.auth.signOut()`).

### `src/routes/api/public/hooks/produce.ts` — Webhook programado

- Endpoint público que no usa auth de Supabase; usa `x-scheduler-secret`/`apikey` contra `SCHEDULER_HOOK_SECRET`. Ideal para n8n (como pidió el usuario en el README original).

---

## Data Flow detallado

### 1. Producción manual desde el dashboard

1. Usuario entra a `/` → `useSession()` → si no hay sesión, `navigate("/auth")`.
2. Usuario hace login en `/auth` → `supabase.auth.signInWithPassword()` → sesión persistida en localStorage.
3. Botón "Producir ahora" → `useMutation` → `useServerFn(startRun)` → `attachSupabaseAuth` adjunta Bearer token → `requireSupabaseAuth` valida JWT → handler ejecuta `runProduction(slot, "manual")`.
4. `runProduction` persiste `runs` con cada estado → el dashboard hace polling de `listRuns` cada 15s para actualizar estados en vivo.
5. Usuario clickea una corrida → `/corrida/$runId` → `getRun` → renderiza dossier en 5 tabs (Guion, Prompt maestro, Planos, Publicación, Inteligencia) con URLs firmadas de frames/video.

### 2. Producción programada (2 veces/día)

1. **n8n** (o scheduler) hace `POST /api/public/hooks/produce` con header `x-scheduler-secret`.
2. El handler valida el secreto, parsea `{slot}`, importa `runProduction`.
3. El flujo es idéntico al manual, con `triggered_by: "programado"` (visible como badge en el dashboard).
4. **No existe** implementación nativa de cron en el repo — depende 100% del scheduler externo.

### 3. Flujo interno de datos del pipeline

```
sense() → TrendItem[] → asBriefing() → string
  → reason("seleccion") → Seleccion (JSON schema estricto)
  → reason("dossier") → dossier (JSON schema estricto)
  → reason("qa_notes") → string[] (notas de revisión)
  → dossierFinal = dossier + seleccion + warnings + reviewNotes
  → generateFrame() ×3 (solo primeros 3 planos del dossier)
  → generarVideo(masterPrompt) → MP4 → Storage bucket "videos"
  → UPDATE runs SET dossier, masterpiece, storyboard, video_url, status='done'
```

---

## Comportamientos no obvios y decisiones de diseño

- **Streaming obligatorio en `reason()`**: un comentario en `ai.server.ts` explica que las corridas de razonamiento pueden superar los 2 minutos y una respuesta `fetch` bufferizada se cortaría a mitad de camino (timeout de infra). Si se migra a otro proveedor, **hay que preservar el streaming** o implementar manejo de timeout explícito.
- **`any` y cast agresivos en `ai.server.ts`**: el parsing de respuestas (especialmente video) usa `(value as any)?.output?.[0]?...` — defensivo porque el gateway devuelve formatos variables. Cualquier migración a otro proveedor debe replicar esta robustez de extracción.
- **Soporte para nuevas API keys de Supabase**: los 4 archivos generados incluyen `isNewSupabaseApiKey()` (`sb_publishable_*`, `sb_secret_*`) que quita el `Authorization: Bearer` del fetch wrapper porque las nuevas keys son strings opacas, no JWTs. El `.env` usa este formato nuevo.
- **El server entry `src/server.ts` es un wrapper de errores**: Nitro/h3 traga los throws dentro de handlers y devuelve `{"unhandled":true,"message":"HTTPError"}` sin stack. `error-capture.ts` intercepta `console.error` para capturar el error original fuera de banda (TTL 5s) y `server.ts` lo recupera para loggear el stack completo.
- **`supabaseAdmin` es un Proxy lazy**: `client.server.ts` no crea el cliente hasta el primer acceso (para no romper build client-side). Igual `client.ts` del lado público.
- **Import dinámico de `pipeline.server`**: en `runs.functions.ts` se hace `await import("./pipeline.server")` dentro del handler para que el módulo server-only no se incluya en el bundle del cliente.
- **Los archivos de `src/integrations/supabase/` están marcados como "automáticamente generados"**: Lovable los regeneraría. Cualquier edición directa (p.ej., quitar `requireSupabaseAuth`) puede perderse si el proyecto se vuelve a conectar a Lovable.
- **Sin cron nativo**: el "dos veces al día" del README depende de un servicio externo (n8n como pidió el usuario originalmente). El webhook existe precisamente para eso.
- **Storyboard limitado a 3 planos**: `renderStoryboard` hace `planos.slice(0, 3)` aunque el dossier pida 12-18 planos — por costo/velocidad. Solo se generan frames de referencia, no el video completo plano por plano.
- **Monetización explícita en el prompt del sistema**: el agente IA está instruido para optimizar "visualizaciones que generan ingresos" y el dossier incluye sección de monetización con riesgo de desmonetización. El proyecto es abiertamente comercial (no educativo).
- **CSRF activado solo para serverFns**: `start.ts` filtra `ctx.handlerType === "serverFn"` para `createCsrfMiddleware`.

---

## Modelo de datos (inferido del código)

### Tabla `runs`

| Columna       | Tipo (inferido)                                                                        |
| ------------- | -------------------------------------------------------------------------------------- |
| id            | uuid PK                                                                                |
| slot          | 'viral' \| 'general'                                                                   |
| status        | 'pending' \| 'sensing' \| 'analyzing' \| 'writing' \| 'rendering' \| 'done' \| 'error' |
| topic         | text nullable                                                                          |
| topic_angle   | text nullable                                                                          |
| viral_score   | numeric nullable                                                                       |
| emotion       | text nullable                                                                          |
| master_prompt | text nullable                                                                          |
| error         | text nullable                                                                          |
| triggered_by  | text ('manual' \| 'programado')                                                        |
| duration_ms   | numeric nullable                                                                       |
| dossier       | jsonb nullable                                                                         |
| storyboard    | jsonb nullable (array de {numero, path})                                               |
| video_url     | text nullable (path en Storage)                                                        |
| created_at    | timestamptz                                                                            |

### Tabla `trend_candidates`

`id`, `run_id` (FK → runs), `title`, `channel`, `views`, `velocity`, `score`, `source` ('youtube' \| 'google_trends' \| 'news'), `url`

### Storage buckets

- `storyboards/` — `{runId}/plano-N.png`
- `videos/` — `{runId}/final.mp4`

---

## ⭐ Cambios requeridos por el usuario

### Punto 1: Eliminar logueo inicial (entrada directa)

Archivos a modificar:

| Archivo                                                             | Qué tocar                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/auth.tsx`                                               | Puede **eliminarse** o dejar de enrutarse (quitar del routeTree — aunque es generado, se regenera al borrar el archivo).                                                                                                                                         |
| `src/routes/index.tsx`                                              | Eliminar el `useEffect` que redirige a `/auth` si no hay sesión; eliminar el botón "Salir"; eliminar `useSession` y el check `if (loading                                                                                                                        |     | !session)`. |
| `src/routes/corrida.$runId.tsx`                                     | Ídem: eliminar redirect a `/auth`, `useSession`, check de loading.                                                                                                                                                                                               |
| `src/hooks/use-session.ts`                                          | Puede eliminarse (o dejarse sin uso).                                                                                                                                                                                                                            |
| `src/lib/runs.functions.ts`                                         | **Quitar `.middleware([requireSupabaseAuth])`** de las 4 server functions. El handler de `listRuns` y `getRun` usan `context.supabase` (provisto por el middleware) — habrá que reemplazarlo por `supabaseAdmin` (ops. de lectura) o un cliente server sin auth. |
| `src/integrations/supabase/auth-middleware.ts` + `auth-attacher.ts` | Ya no se necesitan (o dejarlos inertes). Son "generados", pero funcionan aunque no se referencien.                                                                                                                                                               |
| `src/start.ts`                                                      | Quitar `attachSupabaseAuth` del `functionMiddleware` (si se elimina el archivo, el import rompe el build).                                                                                                                                                       |

**Atención**: el middleware `requireSupabaseAuth` inyecta `context.supabase` con claims del usuario. Si se elimina, `listRuns` y `getRun` no tienen `context.supabase` — hay que adjudicar el `supabaseAdmin` (que ya existe en `client.server.ts`) o crear un cliente server sin rol. También `getRun` genera URLs firmadas de storage usando ese cliente — con `supabaseAdmin` funcionará igual.

### Punto 2: Eliminar créditos de Lovable → integración IA gratuita robusta

El **único punto de contacto con Lovable** es `src/lib/ai.server.ts` (la key `LOVABLE_API_KEY`). Los modelos usados (`openai/gpt-5.6-sol`, `google/gemini-3.1-flash-image`) son enrutados por el gateway. Estrategias de reemplazo:

1. **`reason<T>()`** → Migrar a un proveedor con **free tier** y salida JSON estructurada:
   - **Google Gemini API** (`@google/generative-ai` o REST): tiene `responseMimeType: "application/json"` + `responseSchema` (equivalente a json_schema). Modelos como `gemini-2.0-flash` / `gemini-2.5-flash` tienen free tier. **Soporta streaming** (`streamGenerateContent?alt=sse`).
   - **OpenAI-compatible**: `GROQ_API_KEY` (tiene free tier), o `OPENAI_API_KEY` directo. El endpoint `/responses` del gateway es el mismo formato de la API oficial de OpenAI — la migración es casi directa cambiando base URL y key.
   - **Preservar**: el JSON schema estricto (critical para que el pipeline parseé `Seleccion`/`dossier` con `satisfies` de tipos), el streaming de más de 2 min, y el fallback de extracción `text.indexOf("{")...text.lastIndexOf("}")`.
2. **`generateFrame()`** → **Google Gemini** `gemini-3.1-flash-image` (o `imagen` de Google AI Studio) es el mismo modelo que ya usa Lovable — se puede llamar directo con `GEMINI_API_KEY` (free tier disponible). **Elección natural** porque replica exactamente lo que ya está en el gateway.
3. **`generateVideo()`** → El más difícil con free tier real:
   - Modelos de video gratuitos son escasos (Pika, Runway, Kling tienen trials limitados).
   - Alternativa robusta: **fallback en cascada** — si la generación de video falla, la corrida **no debe fracasar**: el dossier + prompt maestro + storyboard ya son 90% del valor. Actualmente `renderVideo` ya es tolerante (catch → `return null`), así que la corrida queda `done` sin video.
   - Se puede implementar un **multi-proveedor** (intentar proveedor A, si falla → B, si falla → null) para robustecer.
4. **Env vars nuevas**: `GEMINI_API_KEY` (texto + imagen), eventualmente `GROQ_API_KEY`/`OPENAI_API_KEY`; **eliminar** `LOVABLE_API_KEY` del entorno.
5. **Robustez adicional sugerida**: agregar `timeout` explícito con `AbortController` en cada fetch (el gateway de Lovable lo maneja implícitamente; al ir directo a proveedores, hay que implementarlo), reintentos con backoff exponencial, y rate-limit awareness (los free tiers tienen RPM límites).
6. **Lovable residuals a limpiar**: `AGENTS.md`, `src/lib/lovable-error-reporting.ts` (reporta al editor Lovable — inofensivo pero desechable), la marca del README ("Built with Lovable"), `@lovable.dev/vite-tanstack-config` en `vite.config.ts` + devDependencies (⚠ si se quita, se pierde toda la configuración de build: TanStack Start, nitro, tailwind — requiere reconfigurar `vite.config.ts` manualmente).

### Riesgos de la migración de IA

- **Los schemas JSON estrictos son el contrato**: `pipeline.server.ts` castea el resultado de `reason<T>` directamente a `Seleccion` y `Record<string, unknown>`. Si el nuevo proveedor no respeta `additionalProperties: false` o devuelve campos extra, los datos entran igual (el tipo es TS-time, no runtime) y la UI los ignora — pero las secciones podrían verse incompletas.
- **El modelo de razonamiento debe soportar salida estructurada estricta**: no todos los free tiers lo soportan (o lo soportan con esquemas limitados). Verificar Gemini `responseSchema` (usa el formato `Schema` de Google, no el json-schema de OpenAI — requiere traducción), o elegir un endpoint OpenAI-compatible (formato idéntico, migración trivial).
- **Tiempos de espera**: las llamadas `reason(effort: "high")` con dossier pueden superar 2 minutos — verificar límites de timeout del proveedor elegido (Gemini free tiene límites de contexto/output grandes; Groq es rápido; OpenAI sin `reasoning` también).
- **Costos de video**: si el objetivo es video 100% gratuito, la calidad será limitada. El sistema ya degrada con gracia (video opcional) — mantener esa filosofía.

---

## Módulos de referencia

| Archivo                                                    | Propósito                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/lib/ai.server.ts`                                     | ⭐ Capa única de IA — gateway Lovable (razonamiento+imagen+video). Archivo principal del punto #2. |
| `src/lib/pipeline.server.ts`                               | ⭐ Orquestador de producción: estados, dossier, storyboard, video, persistencia.                   |
| `src/lib/trends.server.ts`                                 | Sensado multi-fuente (YouTube, Trends, News) con scoring de viralidad.                             |
| `src/lib/runs.functions.ts`                                | Server functions RPC — punto de entrada para el dashboard (⭐ tocar para punto #1).                |
| `src/routes/index.tsx`                                     | Dashboard principal con métricas y disparo manual (⭐ tocar para punto #1).                        |
| `src/routes/corrida.$runId.tsx`                            | Detalle de corrida: 5 tabs con todo el dossier (⭐ tocar para punto #1).                           |
| `src/routes/auth.tsx`                                      | Login/signup con Supabase Auth (⭐ eliminar para punto #1).                                        |
| `src/routes/api/public/hooks/produce.ts`                   | Webhook para scheduler externo (n8n) — autenticado con secreto.                                    |
| `src/hooks/use-session.ts`                                 | Estado de sesión cliente (⭐ eliminar/neutralizar para punto #1).                                  |
| `src/integrations/supabase/auth-middleware.ts`             | Middleware JWT para serverFns (⭐ eliminar/quitar de puntos #1).                                   |
| `src/integrations/supabase/auth-attacher.ts`               | Adjunta Bearer token desde cliente (⭐ eliminar para punto #1).                                    |
| `src/integrations/supabase/client.ts` / `client.server.ts` | Clientes Supabase público y admin (service role).                                                  |
| `src/start.ts`                                             | Instancia TanStack Start + middlewares globales (⭐ quitar attachSupabaseAuth).                    |
| `src/server.ts`                                            | Server entry — protección ante errores SSR tragados por h3.                                        |
| `src/lib/error-capture.ts`                                 | Captura errores fuera de banda con TTL para recuperar stacks.                                      |
| `src/lib/lovable-error-reporting.ts`                       | Telemetría hacia el editor Lovable — desechable tras migración.                                    |
| `src/router.tsx`                                           | Crea router con QueryClient.                                                                       |
| `src/styles.css`                                           | Tema oscuro completo (tokens oklch, panel, glow, live-dot).                                        |

---

## Orden de lectura sugerido para un developer nuevo

1. `src/lib/pipeline.server.ts` — El corazón: muestra todo el flujo de producción y los estados.
2. `src/lib/ai.server.ts` — Cómo se habla con la IA (y qué hay que reemplazar).
3. `src/lib/trends.server.ts` — De dónde sale la materia prima (tendencias).
4. `src/lib/runs.functions.ts` — El contrato RPC entre UI y servidor.
5. `src/routes/index.tsx` — La UI que consume todo.
6. `src/routes/corrida.$runId.tsx` — Cómo se visualiza el dossier final.

---

## Notas finales

- **El proyecto está en un estado funcional completo**: el pipeline funciona de punta a punta (sensado → IA → dossier → storage → dashboard).
- **El ".env" contiene las credenciales Supabase** (publishable key, URL). No contiene `LOVABLE_API_KEY`, `YOUTUBE_API_KEY` ni `SCHEDULER_HOOK_SECRET` — esas deben existir en el entorno de despliegue (Lovable Cloud / Vercel / Cloudflare).
- **Los archivos `src/integrations/supabase/*` dicen "automáticamente generados"** — si se editan a mano, Lovable podría sobrescribirlos si el proyecto se reconecta. Considerar mover la lógica de auth a archivos propios si la migración es definitiva.
- `routeTree.gen.ts` es generado por el plugin de TanStack — se actualiza solo al crear/borrar archivos de rutas.
