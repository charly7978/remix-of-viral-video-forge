# Forja Viral — Remix of Viral Video Forge

Sistema automatizado de producción de shorts virales de **alto impacto y alcance permanente** para **YouTube Shorts** y **TikTok**, con **IA gratuita e ilimitada** (sin claves ni cuotas).

La estrategia NO persigue tendencias del día ni contenidos pasajeros. Usa toda la capacidad de razonamiento del modelo para generar videos que se vuelven virales por su propio mérito, con alcance de 18 a 50+ años, sobre pilares permanentes de altísima aceptación: sexualidad, horóscopos, mitos, efemérides importantes, misterios profundos, descubrimientos recientes, psicología y dinero.

1. **Genera** temas permanentes de alto impacto desde los pilares (no sensa la web: propone ángulos de alcance comprobado).
2. **Selecciona** con IA el ángulo de mayor potencia emocional, amplitud de audiencia y compartibilidad, con ventana de oportunidad.
3. **Escribe** un dossier técnico completo: gancho de 3 segundos, guion segundo a segundo (45-55s), arquitectura de retención, 16-22 planos cinematográficos con prompts de generación, estilo visual, subtítulos animados, audio y metadatos de publicación.
4. **Audita** el resultado con un control de calidad automático (checklist mecánico + puntaje de IA) que decide si se aprueba o se reescribe.
5. **Renderiza** el storyboard (frames de IA) y ensambla el video vertical final con ffmpeg (movimiento de cámara, TTS y subtítulos animados) o con Veo si hay `GEMINI_API_KEY`.

## Cómo funciona

- **Dashboard**: panel de operaciones con métricas, disparo manual de producción y historial.
- **Webhook público** `POST /api/public/hooks/produce` para el disparador programado (n8n, cron, etc.). Se autentica con el header `x-scheduler-secret` (ver `SCHEDULER_HOOK_SECRET`).
- **Sin login**: el panel es de acceso directo. Bloquea el acceso público a nivel de red si lo desplegás a Internet.

## Stack

- **Frontend/backend**: TanStack Start (React 19 + Nitro) con Vite.
- **Base de datos + storage**: Supabase (PostgreSQL + buckets `storyboards` y `videos`).
- **IA (gratuita e ilimitada)**: **Pollinations.ai** para razonamiento (`text.pollinations.ai`) e imágenes, sin API key ni límites. Fallback a **Ollama** local. **Video**: render gratuito con **ffmpeg**; opcionalmente Google Veo con `GEMINI_API_KEY`.

## Requisitos

- Node.js 20+ (o Bun), **ffmpeg** instalado en el servidor para el render gratuito, y un proyecto Supabase con las tablas y buckets descritos en `supabase/migrations/`.
- (Opcional) `GEMINI_API_KEY` de [Google AI Studio](https://aistudio.google.com/apikey) para calidad premium de video con Veo.

## Configuración

1. Cloná el repo y copiá `.env.example` a `.env`, completando las claves.
2. Instalá dependencias: `npm i` (o `bun install`).
3. Levantá el servidor de desarrollo: `npm run dev`.

Variables de entorno:

| Variable                                                     | Descripción                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | URL del proyecto Supabase                                                                                                                                           |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key                                                                                                                                                |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | Service role key (SECRETA, solo servidor). Panel: **Supabase → Settings → API → Project API keys → service_role**. Sin ella el panel abre pero las corridas fallan. |
| `GEMINI_API_KEY`                                             | Clave de Google AI Studio (opcional, solo para video premium con Veo). Gratis en https://aistudio.google.com/apikey                                                 |
| `SCHEDULER_HOOK_SECRET`                                      | Secreto del webhook de producción programada                                                                                                                        |

## Scripts

```sh
npm run dev        # desarrollo
npm run build      # build de producción
npm run lint       # eslint
npm run format     # prettier
```

## Scripts de producción programada (n8n)

Para producir "impacto máximo" a las 09:00 y "interés permanente" a las 18:00 (hora Argentina) con n8n:

1. Workflow con nodo **Schedule Trigger** (CRON `0 9 * * *` y `0 18 * * *` en `America/Argentina/Buenos_Aires`).
2. Nodo **HTTP Request**: `POST /api/public/hooks/produce` con header `x-scheduler-secret: <tu secreto>` y body `{"slot":"viral"}` (o `"general"` para la segunda corrida).
