# Radar Viral AR — Guía para agentes de IA

## Stack

- **Framework**: TanStack Start (React 19) con Vite y Nitro (SSR).
- **Base de datos + storage**: Supabase (PostgreSQL, buckets `storyboards` y `videos`).
- **IA gratuita** (sin consumo de créditos):
  - **Razonamiento**: cascada **Groq** (`llama-3.3-70b-versatile`, clave `GROQ_API_KEY`) → **OpenRouter** modelo `:free` (clave `OPENROUTER_API_KEY`). Con una alcanza; con ambas hay fallback automático.
  - **Imágenes** (storyboard): **Pollinations.ai** — sin API key.
  - **Video**: opcional vía Google Veo con `GEMINI_API_KEY` (sin clave o sin cuota, la corrida queda con dossier + storyboard + prompt maestro; nunca falla).

## Convenciones

- Las rutas son **file-based** (TanStack Start): cada `.tsx` en `src/routes/` es una ruta. Ver `src/routes/README.md`. El archivo `src/routeTree.gen.ts` es generado automáticamente — no editarlo a mano.
- Los módulos server-only van en `src/lib/*.server.ts`. Las server functions viven en `src/lib/runs.functions.ts` y se importan desde el cliente con `useServerFn`.
- Formato: Prettier configurado en `.prettierrc`. Correr `npm run format` antes de commitear.
- Tipado estricto con TypeScript. Antes de terminar, correr `npx tsc --noEmit` y `npm run lint` — deben quedar en cero.

## Git

- No reescribir historial público: evitar force push, rebase, amend o squash de commits ya publicados. Mantener la rama en un estado funcional; los cambios se sincronizan con el repositorio remoto.

## Arquitectura en una línea

`src/routes/*.tsx` (UI) → `src/lib/runs.functions.ts` (server functions) → `src/lib/pipeline.server.ts` (orquestador) → `src/lib/ai.server.ts` (razonamiento Groq→OpenRouter + imágenes Pollinations) + `src/lib/video.server.ts` (video opcional) y `src/lib/trends.server.ts` (sensado) → persistencia en Supabase (`src/integrations/supabase/client.server.ts`).
