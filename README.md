# Radar Viral AR — Remix of Viral Video Forge

Sistema automatizado de producción de shorts virales para **YouTube Shorts** y **TikTok**, enfocado en **Argentina**.

Dos veces al día (vía scheduler externo como n8n) los agentes:
1. **Sensan** las tendencias reales del país en vivo: YouTube (más vistos en AR), Google Trends Argentina y titulares de Google News.
2. **Seleccionan** con IA el tema con más tracción real, priorizando velocidad de visualizaciones por hora sobre volumen acumulado, y detectan el mejor ángulo con ventana de oportunidad.
3. **Escriben** un dossier técnico completo: gancho de 3 segundos, guion segundo a segundo (40-55s), arquitectura de retención, 12-18 planos con prompts de generación, audio, metadatos de publicación y plan de monetización.
4. **Auditan** el resultado con un control de calidad automático (checklist mecánico + puntaje de IA) que decide si se aprueba o se reescribe.
5. **Renderizan** el storyboard (frames de IA) y encolan el video vertical final.

## Cómo funciona

- **Dashboard**: panel de operaciones con métricas, disparo manual de producción y historial.
- **Webhook público** `POST /api/public/hooks/produce` para el disparador programado (n8n, cron, etc.). Se autentica con el header `x-scheduler-secret` (ver `SCHEDULER_HOOK_SECRET`).
- **Sin login**: el panel es de acceso directo. Bloquea el acceso público a nivel de red si lo desplegás a Internet.

## Stack

- **Frontend/backend**: TanStack Start (React 19 + Nitro) con Vite.
- **Base de datos + storage**: Supabase (PostgreSQL + buckets `storyboards` y `videos`).
- **IA (gratuita)**: Google Gemini — razonamiento con salida JSON estructurada (`gemini-2.5-flash`) e imágenes (`gemini-2.5-flash-image`). Sin cuotas de ningún gateway: usás tu propia clave de Google AI Studio.

## Requisitos

- Node.js 20+ (o Bun) y una cuenta en [Google AI Studio](https://aistudio.google.com/apikey) para la clave `GEMINI_API_KEY`.
- Clave de YouTube Data API v3 (opcional pero muy recomendada) para el sensado de tendencias.
- Proyecto Supabase con las tablas y buckets descritos en `supabase/migrations/`.

## Configuración

1. Cloná el repo y copiá `.env.example` a `.env`, completando las claves.
2. Instalá dependencias: `npm i` (o `bun install`).
3. Levantá el servidor de desarrollo: `npm run dev`.

Variables de entorno:

| Variable | Descripción |
| --- | --- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key |
| `GEMINI_API_KEY` | Clave de Google AI Studio (razonamiento + imágenes) |
| `YOUTUBE_API_KEY` | Clave de YouTube Data API v3 (sensado de tendencias) |
| `SCHEDULER_HOOK_SECRET` | Secreto del webhook de producción programada |

## Scripts

```sh
npm run dev        # desarrollo
npm run build      # build de producción
npm run lint       # eslint
npm run format     # prettier
```

## Scripts de producción programada (n8n)

Para producir "el tema del momento" a las 09:00 y 18:00 (hora Argentina) con n8n:

1. Workflow con nodo **Schedule Trigger** (CRON `0 9 * * *` y `0 18 * * *` en `America/Argentina/Buenos_Aires`).
2. Nodo **HTTP Request**: `POST /api/public/hooks/produce` con header `x-scheduler-secret: <tu secreto>` y body `{"slot":"viral"}` (o `"general"` para la segunda corrida).
