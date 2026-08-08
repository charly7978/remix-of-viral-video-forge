# Implementation Plan

[Overview]

Migrar Radar Viral AR a un sistema de IA 100% gratuito basado únicamente en la API key gratis de Google Gemini (sin consumo de créditos) y limpiar todos los residuos de Lovable que quedaron tras la migración.

El proyecto ya pasó por dos migraciones mayores que la documentación (`project_info__1.md`/`__2.md`) no reflejan: el **login fue eliminado** (no existen `auth.tsx`, `use-session.ts` ni `requireSupabaseAuth` en las server functions — el dashboard entra directo) y la **IA ya se conecta directo a Gemini** (`ai.server.ts` con `gemini-2.0-flash` para razonamiento JSON estructurado, `gemini-2.5-flash-image` para frames, y `video.server.ts` con Veo para el video, degradando con elegancia si no hay clave). El type-check corre limpio y el lint solo marca CRLF en los archivos generados de Supabase.

Lo que queda por hacer es una **capa de higiene final y endurecimiento**: eliminar middlewares de auth muertos, cambiar los últimos links y textos que apuntan al gateway de créditos de Lovable por alternativas correctas de Google AI Studio, sanear una `GEMINI_API_KEY` real que se filtró en `.env.example`, reescribir `AGENTS.md` sin la marca de Lovable, y normalizar el formato del código. Se preserva `@lovable.dev/vite-tanstack-config` en `vite.config.ts` y `bunfig.toml` porque son la base del build de TanStack Start + Nitro: quitarlos rompería la compilación sin aportar beneficio funcional.

[Types]

Los cambios no introducen tipos nuevos: se borran dos módulos de middleware que exportaban tipos sin uso y se modifican valores de un tipo existente.

- `src/integrations/supabase/auth-attacher.ts` — **eliminar**: expone `attachSupabaseAuth` (único export, solo lo referencia `src/start.ts`).
- `src/integrations/supabase/auth-middleware.ts` — **eliminar**: expone `requireSupabaseAuth` (sin referencias en el árbol actual).
- `ProviderErrorInfo` (`src/lib/ai-errors.ts`) — sin cambios de forma; solo se alteran los valores de `acciones[].label` y `acciones[].href` para las ramas `credits` y `unavailable`.
- No hay enums, interfaces ni schemas nuevos. El contrato de datos con Supabase (tablas `runs`, `trend_candidates`, buckets `storyboards`/`videos`) queda intacto.

[Files]

Se modifican 6 archivos y se eliminan 2; ninguna ruta nueva se crea.

- **Modificar `src/start.ts`** — quitar el import de `@/integrations/supabase/auth-attacher` y la entrada `functionMiddleware: [attachSupabaseAuth]` del `createStart`. `functionMiddleware` puede omitirse (queda sin middlewares de función) o fijarse a `[]`; `requestMiddleware` (`errorMiddleware`, `csrfMiddleware`) no se toca.
- **Eliminar `src/integrations/supabase/auth-attacher.ts`** — middleware cliente que adjuntaba el Bearer token; sin sesión no tiene sentido. Antes de borrar, verificar con búsqueda `attachSupabaseAuth` que no queden referencias.
- **Eliminar `src/integrations/supabase/auth-middleware.ts`** — middleware servidor de validación JWT, sin uso. Verificar `requireSupabaseAuth` sin referencias antes de borrar.
- **Modificar `src/lib/ai-errors.ts`** — en `classifyProviderError`:
  - Rama `credits`: reemplazar `{ label: "Recargar créditos de Lovable", href: "https://lovable.dev/pricing" }` por `{ label: "Habilitar facturación en Google AI Studio", href: "https://aistudio.google.com/apikey" }` (mantener la acción de reintentar).
  - Rama `unavailable`: quitar `{ label: "Ver planes y créditos", href: "https://lovable.dev/pricing" }`, dejando solo la acción de reintentar (o link a AI Studio si aplica).
  - Revisar textos de `detalle` para que no mencionen "créditos de Lovable".
- **Modificar `src/integrations/supabase/client.ts` y `src/integrations/supabase/client.server.ts`** — reemplazar el texto `Connect Supabase in Lovable Cloud.` de los mensajes de error por `Connect Supabase in your deployment environment.` (son archivos con encabezado "generado", pero el proyecto ya no está conectado al regenerador de Lovable; editarlos es seguro y no rompe el build).
- **Modificar `.env.example`** — la variable `GEMINI_API_KEY` contiene una clave real (`AQ.Ab8RN6KXy07...`). Reemplazarla por un placeholder (`"tu-clave-de-google-ai-studio"`) o por el texto `"<obtener en https://aistudio.google.com/apikey>"`. ⚠ Acción complementaria del usuario: **revocar/regenerar esa clave en Google AI Studio** porque quedó expuesta en el repositorio. Verificar también el `.env` local (840 bytes) y la l10n de `GEMINI_API_KEY`; no tocar los valores reales del `.env`.
- **Modificar `AGENTS.md`** — reemplazar el bloque `<!-- LOVABLE:BEGIN -->` por contenido propio del proyecto: stack real (TanStack Start + Nitro + Supabase + Gemini free), convenciones de rutas (referir a `src/routes/README.md`), guardia de historial git (mantener la recomendación de no reescribir historia pública, pero sin referencias al editor Lovable), y nota de que la IA usa API key gratis de Gemini (`GEMINI_API_KEY`).
- **No se tocan**: `vite.config.ts` (usa `@lovable.dev/vite-tanstack-config` — base del build, reemplazarlo es un proyecto aparte y de alto riesgo), `bunfig.toml` (los `minimumReleaseAgeExcludes` de paquetes `@lovable.dev/*` son de supply-chain e imprescindibles para instalar la cadena de build), `package.json` (deps Lovable requeridas por el build), `src/lib/lovable-error-reporting.ts` (no existe en el código actual — era solo documentación), ni `project_info__*.md` (documentación histórica, sin efecto en runtime).

[Functions]

Las únicas firmas que cambian son internas; ninguna función exportada del pipeline cambia su contrato.

- `createStart()` en `src/start.ts`
  - **Antes**: `createStart(() => ({ functionMiddleware: [attachSupabaseAuth], requestMiddleware: [errorMiddleware, csrfMiddleware] }))`
  - **Después**: `createStart(() => ({ requestMiddleware: [errorMiddleware, csrfMiddleware] }))`
  - Eliminar la línea `import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";`. Sin esto, el bundle cliente no arrastra el módulo muerto.
- `classifyProviderError(raw: unknown): ProviderErrorInfo` en `src/lib/ai-errors.ts`
  - Mantiene firma y comportamiento (detección por substrings del mensaje crudo).
  - Cambio de valores: en la rama `credits`, `acciones` pasa a `[{ label: "Habilitar facturación en Google AI Studio", href: "https://aistudio.google.com/apikey" }, { label: "Reintentar generación", action: "reintentar" }]`. En la rama `unavailable`, `acciones` pasa a `[{ label: "Reintentar generación", action: "reintentar" }]`.
  - Ajustar `titulo`/`detalle` asociados para reflejar que el video se genera con Gemini (Veo) y que el fallo por facturación se resuelve habilitando billing en Google AI Studio, no recargando créditos Lovable.
- Sin cambios en `reason<T>()`, `generateFrame()`, `generateVideo()`, `runProduction()`, `sense()`, ni en las 5 server functions (`listRuns`, `getRun`, `startRun`, `advanceVideo`, `deleteRun`).

[Changes]

Limpieza incremental, una capa a la vez, verificando el build en cada hito.

1. **Limpiar `src/start.ts`**: quitar el import de `attachSupabaseAuth` y la propiedad `functionMiddleware`. (Dependencia: ninguna. Paso 1 porque desbloquea el borrado de archivos.)
2. **Verificar y eliminar los middlewares muertos**: buscar `attachSupabaseAuth` y `requireSupabaseAuth` en `src` (uso `findstr` o el buscador del IDE; ripgrep no está disponible en este entorno). Si no hay más referencias, borrar `src/integrations/supabase/auth-attacher.ts` y `src/integrations/supabase/auth-middleware.ts`. El route tree no los referencia (no son rutas), así que no se regenera nada.
3. **Limpiar `src/lib/ai-errors.ts`**: reemplazar los links y textos de Lovable por alternativas de Google AI Studio según la sección [Files]. Mantener los `action: "reintentar"` (los consume `ProviderAlert` en `index.tsx` y `corrida.$runId.tsx`).
4. **Corregir mensajes de Supabase**: en `client.ts` y `client.server.ts`, cambiar `Connect Supabase in Lovable Cloud.` por `Connect Supabase in your deployment environment.` (dos archivos; el tercero con ese texto, `auth-middleware.ts`, ya se eliminó en el paso 2).
5. **Sanear `.env.example`**: reemplazar la `GEMINI_API_KEY` real por un placeholder. Verificar que el `.env` local no tenga la clave filtrada (los valores reales del `.env` no se editan en este plan). Notificar al usuario que debe revocar/regenerar la clave expuesta en Google AI Studio.
6. **Reescribir `AGENTS.md`**: quitar el bloque `<!-- LOVABLE:BEGIN -->` y documentar el proyecto real (stack, convenciones, guardia git genérica).
7. **Normalizar formato**: correr `npm run format` (prettier) para limpiar los CRLF que el lint marca en `client.ts` y `client.server.ts` (los otros dos archivos con CRLF ya se borraron). Esto deja el lint en cero.
8. **Verificación final**: `npx tsc --noEmit` (debe seguir limpio), `npm run lint` (cero errores), `npm run build` (build producción OK) y smoke test con `npm run dev` (dashboard carga directo sin login; `POST /api/public/hooks/produce` sin secreto responde 401; con secreto del ambiente arranca una corrida). Si hubiera que reconfigurar algo de build, hacerlo antes de considerar cerrado el punto.

[Tests]

Estrategia: verificación estática + build + smoke test manual; no hay suite de tests automatizada en el repo.

- **TypeScript**: `npx tsc --noEmit` sin errores (hoy ya está limpio; debe seguir limpio tras borrar los middlewares, lo que confirma que no hay imports colgados).
- **Lint**: `npm run lint` en cero. El estado actual solo marca CRLF en los 4 archivos generados; tras borrar 2 y formatear los otros 2, debe quedar cero.
- **Build**: `npm run build` de producción exitoso (valida que quitar `functionMiddleware` no rompe la instancia de TanStack Start y que borrar los archivos no deja referencias en el bundle cliente).
- **Smoke test (dev server)**:
  - Navegar a `/` → dashboard renderiza sin redirección a `/auth`.
  - Probar el flujo de una corrida con `GEMINI_API_KEY` (si hay cuota free) → corrida `done` con dossier.
  - `POST /api/public/hooks/produce` sin header → `401 { error: "No autorizado" }`; con `x-scheduler-secret` correcto → `200 { ok: true }`.
- **Regresión manual de UI**: el botón "Generar ahora" en `/corrida/$runId` sigue mostrando las acciones correctas: en error de créditos ahora enlaza a Google AI Studio, no a Lovable.
- **Caso límite**: ejecutar una corrida sin `GEMINI_API_KEY` → error claro "Falta GEMINI_API_KEY en el servidor." y la corrida queda en `status: error` sin romper el dashboard (comportamiento existente).
- **Rendimiento**: sin impacto — no se agregan llamadas de red ni cómputo nuevo.
