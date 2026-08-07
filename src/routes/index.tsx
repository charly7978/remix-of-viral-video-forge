import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { Activity, Flame, Play, Sparkles, Timer, TrendingUp } from "lucide-react";
import { listRuns, startRun, type RunRow } from "@/lib/runs.functions";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Radar Viral AR | Producción diaria de shorts" },
      {
        name: "description",
        content:
          "Panel de control que detecta dos veces por día el tema más visto de Argentina y arma el dossier técnico completo del short para YouTube y TikTok.",
      },
      { property: "og:title", content: "Radar Viral AR | Producción diaria de shorts" },
      {
        property: "og:description",
        content:
          "Detección de tendencias argentinas, guion segundo a segundo y prompt maestro listo para generar el video.",
      },
    ],
  }),
  component: Dashboard,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "En cola",
  sensing: "Sensando",
  analyzing: "Analizando",
  writing: "Escribiendo",
  rendering: "Renderizando",
  done: "Listo",
  error: "Falló",
};

function StatusPill({ status }: { status: string }) {
  const live = !["done", "error"].includes(status);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 font-mono text-[0.68rem] uppercase tracking-widest">
      <span
        className={`size-1.5 rounded-full ${
          status === "error"
            ? "bg-destructive"
            : status === "done"
              ? "bg-radar"
              : "live-dot bg-primary"
        }`}
      />
      {STATUS_LABEL[status] ?? status}
      {live ? "…" : ""}
    </span>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const queryClient = useQueryClient();
  const fetchRuns = useServerFn(listRuns);
  const trigger = useServerFn(startRun);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => fetchRuns(),
    enabled: Boolean(session),
    refetchInterval: 15_000,
  });

  const mutation = useMutation({
    mutationFn: (slot: "viral" | "general") => trigger({ data: { slot } }),
    onSuccess: async () => {
      toast.success("Producción terminada");
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "La corrida falló");
    },
  });

  const runs = runsQuery.data ?? [];
  const done = runs.filter((run) => run.status === "done");
  const avgScore =
    done.length > 0
      ? Math.round(done.reduce((sum, run) => sum + (run.viral_score ?? 0), 0) / done.length)
      : 0;
  const lastViral = runs.find((run) => run.slot === "viral" && run.status === "done");

  if (loading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="label-caps">Cargando sala de control…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="label-caps">Argentina · 2 producciones por día</p>
          <h1 className="mt-2 text-4xl font-bold md:text-5xl">Radar viral AR</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Los agentes sensan YouTube, Google Trends y los titulares del día, eligen el tema con
            más tracción real y devuelven el dossier técnico completo del short: gancho, guion
            segundo a segundo, plano por plano y prompt maestro listo para el generador de video.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={async () => {
            await supabase.auth.signOut();
            void navigate({ to: "/auth" });
          }}
        >
          Salir
        </Button>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<Activity className="size-4" />} label="Corridas" value={String(runs.length)} />
        <MetricCard
          icon={<TrendingUp className="size-4" />}
          label="Puntaje viral medio"
          value={avgScore > 0 ? `${avgScore}/100` : "—"}
        />
        <MetricCard
          icon={<Flame className="size-4" />}
          label="Último tema caliente"
          value={lastViral?.topic ?? "Sin datos"}
          small
        />
        <MetricCard
          icon={<Timer className="size-4" />}
          label="Duración última corrida"
          value={runs[0]?.duration_ms ? `${Math.round(runs[0].duration_ms / 1000)} s` : "—"}
        />
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <LaunchCard
          title="Tema del momento"
          description="El contenido con más visualizaciones y más velocidad de crecimiento en todo el país, ahora mismo."
          icon={<Flame className="size-5" />}
          busy={mutation.isPending && mutation.variables === "viral"}
          disabled={mutation.isPending}
          onLaunch={() => mutation.mutate("viral")}
          primary
        />
        <LaunchCard
          title="Interés general"
          description="Efemérides, mitos, horóscopo y misterios tratados con la misma tensión que una noticia de último momento."
          icon={<Sparkles className="size-5" />}
          busy={mutation.isPending && mutation.variables === "general"}
          disabled={mutation.isPending}
          onLaunch={() => mutation.mutate("general")}
        />
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold">Historial de producción</h2>
          <p className="label-caps">{runs.length} registros</p>
        </div>

        <div className="mt-4 space-y-3">
          {runsQuery.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
          {!runsQuery.isLoading && runs.length === 0 ? (
            <div className="panel p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Todavía no hay corridas. Lanzá la primera con los botones de arriba o dejá que el
                disparador programado la ejecute.
              </p>
            </div>
          ) : null}
          {runs.map((run) => (
            <RunRowCard key={run.id} run={run} />
          ))}
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="label-caps mt-3">{label}</p>
      <p className={`mt-1 font-display font-bold ${small ? "line-clamp-2 text-base" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}

function LaunchCard({
  title,
  description,
  icon,
  onLaunch,
  busy,
  disabled,
  primary,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onLaunch: () => void;
  busy: boolean;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <div className={`panel p-6 ${primary ? "glow" : ""}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex size-10 items-center justify-center rounded-md ${
            primary ? "signal-surface" : "bg-secondary text-radar"
          }`}
        >
          {icon}
        </span>
        <h3 className="text-xl font-bold">{title}</h3>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      <Button
        className="mt-5 w-full"
        variant={primary ? "default" : "secondary"}
        onClick={onLaunch}
        disabled={disabled}
      >
        <Play className="size-4" />
        {busy ? "Produciendo… puede tardar unos minutos" : "Producir ahora"}
      </Button>
    </div>
  );
}

function RunRowCard({ run }: { run: RunRow }) {
  return (
    <Link
      to="/corrida/$runId"
      params={{ runId: run.id }}
      className="panel block p-5 transition-colors hover:border-primary/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={run.slot === "viral" ? "default" : "secondary"}>
            {run.slot === "viral" ? "Tema del momento" : "Interés general"}
          </Badge>
          <StatusPill status={run.status} />
          <span className="label-caps">{run.triggered_by}</span>
        </div>
        <span className="label-caps">
          {new Date(run.created_at).toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
          })}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-bold">{run.topic ?? "Sin tema todavía"}</h3>
      {run.topic_angle ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{run.topic_angle}</p>
      ) : null}
      {run.error ? <p className="mt-2 text-sm text-destructive">{run.error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {run.viral_score !== null ? (
          <div className="flex items-center gap-2">
            <span className="label-caps">Puntaje</span>
            <span className="font-display text-lg font-bold text-primary">
              {Math.round(run.viral_score)}
            </span>
          </div>
        ) : null}
        {run.quality_score !== null ? (
          <div className="flex items-center gap-2">
            <span className="label-caps">Calidad</span>
            <span
              className={`font-display text-lg font-bold ${run.approved ? "text-radar" : "text-destructive"}`}
            >
              {Math.round(run.quality_score)}
            </span>
          </div>
        ) : null}
        {run.status === "done" ? (
          <Badge variant={run.video_url ? "default" : run.approved ? "secondary" : "destructive"}>
            {run.video_url
              ? "Video listo"
              : run.approved
                ? "Video en render"
                : "Bloqueado por calidad"}
          </Badge>
        ) : null}
        {run.emotion ? (
          <div className="flex items-center gap-2">
            <span className="label-caps">Emoción</span>
            <span className="text-sm">{run.emotion}</span>
          </div>
        ) : null}
      </div>

    </Link>
  );
}
