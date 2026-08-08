# Forja Viral — Guía para agentes de IA

## Stack

- **Framework**: TanStack Start (React 19) con Vite y Nitro (SSR).
- **Base de datos + storage**: Supabase (PostgreSQL, buckets `storyboards` y `videos`).
- **IA gratuita e ilimitada** (sin claves ni cuotas):
  - **Razonamiento**: **Pollinations.ai** (`text.pollinations.ai`, modelos free rotativos) como proveedor principal — sin API key, sin límites de uso. Fallback opcional a **Ollama** local si está corriendo.
  - **Imágenes** (storyboard): **Pollinations.ai** — sin API key, sin límites.
  - **Video**: render gratuito e ilimitado con **ffmpeg** (ensamblado del storyboard + TTS + subtítulos animados). Opcionalmente Google Veo con `GEMINI_API_KEY` como calidad premium; sin clave, el render local gratuito toma el relevo. Nunca falla.

## Estrategia de contenido

- NO se persiguen tendencias del día ni contenidos virales pasajeros.
- Se usa toda la capacidad de razonamiento, inteligencia y creatividad del modelo para generar videos virales de muy alto impacto, con alcance de 18 a 50+ años.
- Pilares permanentes de alta aceptación: sexualidad, horóscopos, mitos, efemérides importantes, misterios profundos, descubrimientos recientes, psicología y dinero.
- La cadena de producción prioriza calidad: imagen cinematográfica (cámara en movimiento, iluminación con carácter, grade coherente), audio nítido y llamativo (voz cálida + música con gancho + SFX), subtítulos integrados animados, enfoques visuales dinámicos y ritmo trepidante. El resultado debe ser dinámico y fresco, no un PowerPoint con audio.

## Convenciones

- Las rutas son **file-based** (TanStack Start): cada `.tsx` en `src/routes/` es una ruta. Ver `src/routes/README.md`. El archivo `src/routeTree.gen.ts` es generado automáticamente — no editarlo a mano.
- Los módulos server-only van en `src/lib/*.server.ts`. Las server functions viven en `src/lib/runs.functions.ts` y se importan desde el cliente con `useServerFn`.
- Formato: Prettier configurado en `.prettierrc`. Correr `npm run format` antes de commitear.
- Tipado estricto con TypeScript. Antes de terminar, correr `npx tsc --noEmit` y `npm run lint` — deben quedar en cero.

## Git

- No reescribir historial público: evitar force push, rebase, amend o squash de commits ya publicados. Mantener la rama en un estado funcional; los cambios se sincronizan con el repositorio remoto.

## Arquitectura en una línea

`src/routes/*.tsx` (UI) → `src/lib/runs.functions.ts` (server functions) → `src/lib/pipeline.server.ts` (orquestador) → `src/lib/ai.server.ts` (razonamiento Pollinations + imágenes Pollinations) + `src/lib/video.server.ts` (render ffmpeg gratuito / Veo) y `src/lib/trends.server.ts` (motor de temas permanentes) → persistencia en Supabase (`src/integrations/supabase/client.server.ts`).
