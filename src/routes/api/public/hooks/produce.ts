import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint público para el disparo programado (n8n, pg_cron o cualquier scheduler).
 * Se autentica con la clave pública del proyecto en la cabecera `apikey`.
 * Body: { "slot": "viral" | "general" }
 */
export const Route = createFileRoute("/api/public/hooks/produce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-scheduler-secret") ?? request.headers.get("apikey");
        const expected = process.env["SCHEDULER_HOOK_SECRET"];

        if (!expected || !provided || provided !== expected) {
          return Response.json({ error: "No autorizado" }, { status: 401 });
        }

        let slot: unknown = "viral";
        try {
          const body = (await request.json()) as { slot?: unknown };
          if (body && typeof body.slot === "string") slot = body.slot;
        } catch {
          // sin cuerpo: se usa la franja por defecto
        }

        if (slot !== "viral" && slot !== "general") {
          return Response.json({ error: "slot debe ser 'viral' o 'general'" }, { status: 400 });
        }

        try {
          const { runProduction } = await import("@/lib/pipeline.server");
          const id = await runProduction(slot, "programado");
          return Response.json({ ok: true, run_id: id, slot });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido";
          console.error("[produce] fallo la corrida:", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
