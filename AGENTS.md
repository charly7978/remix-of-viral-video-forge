# Radar Viral AR — Guía para agentes de IA

## Stack

- **Framework**: TanStack Start (React 19) con Vite y Nitro (SSR).
- **Base de datos + storage**: Supabase (PostgreSQL, buckets `storyboards` y `videos`).
- **IA gratuita**: Google Gemini — razonamiento con salida JSON estructurada (`gemini-2.0-flash`), imágenes (`gemini-2.5-flash-image`) y video (Veo). Única credencial: `GEMINI_API_KEY` (free tier de Google AI Studio, sin consumo de créditos).

## Convenciones

- Las rutas son **file-based** (TanStack Start): cada `.tsx` en `src/routes/` es una ruta. Ver `src/routes/README.md`. El archivo `src/routeTree.gen.ts` es generado automáticamente — no editarlo a mano.
- Los módulos server-only van en `src/lib/*.server.ts`. Las server functions viven en `src/lib/runs.functions.ts` y se importan desde el cliente con `useServerFn`.
- Formato: Prettier configurado en `.prettierrc`. Correr `npm run format` antes de commitear.
- Tipado estricto con TypeScript. Antes de terminar, correr `npx tsc --noEmit` y `npm run lint` — deben quedar en cero.

## Git

- No reescribir historial público: evitar force push, rebase, amend o squash de commits ya publicados. Mantener la rama en un estado funcional; los cambios se sincronizan con el repositorio remoto.

## Arquitectura en una línea

`src/routes/*.tsx` (UI) → `src/lib/runs.functions.ts` (server functions) → `src/lib/pipeline.server.ts` (orquestador) → `src/lib/ai.server.ts` + `src/lib/video.server.ts` (Gemini) y `src/lib/trends.server.ts` (sensado) → persistencia en Supabase (`src/integrations/supabase/client.server.ts`).
