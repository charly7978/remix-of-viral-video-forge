import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, Flame, Play, Sparkles, Timer, TrendingUp } from "lucide-react";
import { listRuns, startRun, type RunRow } from "@/lib/runs.functions";
import { classifyProviderError } from "@/lib/ai-errors";
import { DEFAULT_QUALITY_GATE, QUALITY_GATE_LABELS, type QualityGate } from "@/lib/quality-config";
import { Slider } from "@/components/ui/slider";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Forja Viral | Shorts de alto impacto, gratis e ilimitado" },
      {
        name: "description",
        content:
          "Motor de creación de videos virales permanentes con IA gratuita e ilimitada. Sexualidad, horóscopos, mitos, misterios, descubrimientos y efemérides con alcance de 18 a 50+ años.",
      },
      { property: "og:title", content: "Forja Viral | Shorts de alto impacto, gratis e ilimitado" },
      {
        property: "og:description",
        content:
          "Temas de altísima aceptación, guion segundo a segundo, video cinematográfico y prompt maestro listo para generar. Sin claves ni cuotas.",
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
  const queryClient = useQueryClient();
  const fetchRuns = useServerFn(listRuns);
  const trigger = useServerFn(startRun);

  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => fetchRuns(),
    refetchInterval: 15_000,
  });

  const [gate, setGate] = useState<QualityGate>(DEFAULT_QUALITY_GATE);
  const [fallo, setFallo] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (slot: "viral" | "general") => trigger({ data: { slot, gate } }),
    onSuccess: async () => {
      setFallo(null);
      toast.success("Producción terminada");
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "La corrida falló";
      setFallo(message);
      toast.error(classifyProviderError(message).titulo);
    },
  });

  const runs = runsQuery.data ?? [];
  const done = runs.filter((run) => run.status === "done");
  const avgScore =
    done.length > 0
      ? Math.round(done.reduce((sum, run) => sum + (run.viral_score ?? 0), 0) / done.length)
      : 0;
  const lastViral = runs.find((run) => run.slot === "viral" && run.status === "done");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="label-caps">IA gratuita e ilimitada · video de alto impacto</p>
          <h1 className="mt-2 text-4xl font-bold md:text-5xl">Forja viral</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            El motor usa toda su inteligencia y creatividad para generar shorts virales permanentes
            de altísimo alcance (de 18 a 50+ años): sexualidad, horóscopos, mitos, misterios
            profundos, descubrimientos y efemérides. Devuelve el dossier técnico completo: gancho
            brutal, guion segundo a segundo, plano por plano cinematográfico y un video dinámico con
            audio nítido y subtítulos integrados.
          </p>
        </div>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Activity className="size-4" />}
          label="Corridas"
          value={String(runs.length)}
        />
        <MetricCard
          icon={<TrendingUp className="size-4" />}
          label="Puntaje viral medio"
          value={avgScore > 0 ? `${avgScore}/100` : "—"}
        />
        <MetricCard
          icon={<Flame className="size-4" />}
          label="Último tema de impacto"
          value={lastViral?.topic ?? "Sin datos"}
          small
        />
        <MetricCard
          icon={<Timer className="size-4" />}
          label="Duración última corrida"
          value={runs[0]?.duration_ms ? `${Math.round(runs[0].duration_ms / 1000)} s` : "—"}
        />
      </section>

      {fallo ? (
        <ProviderAlert
          raw={fallo}
          reintentando={mutation.isPending}
          onRetry={() => mutation.mutate(mutation.variables ?? "viral")}
        />
      ) : null}

      <QualityGateCard gate={gate} onChange={setGate} />

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <LaunchCard
          title="Impacto máximo"
          description="El ángulo de mayor alcance y compartibilidad entre los pilares permanentes (sexualidad, horóscopos, mitos, misterios, descubrimientos, efemérides). Pensado para volverse viral por su propio mérito."
          icon={<Flame className="size-5" />}
          busy={mutation.isPending && mutation.variables === "viral"}
          disabled={mutation.isPending}
          onLaunch={() => mutation.mutate("viral")}
          primary
        />
        <LaunchCard
          title="Interés permanente"
          description="Mito que todos creen, horóscopo del signo más polémico, misterio sin resolver o efeméride del día, tratados con la misma tensión de una revelación de último momento."
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
            {run.slot === "viral" ? "Impacto máximo" : "Interés permanente"}
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

/** Umbrales configurables del checklist: sin superarlos, el video no se genera. */
function QualityGateCard({
  gate,
  onChange,
}: {
  gate: QualityGate;
  onChange: (next: QualityGate) => void;
}) {
  const campos: Array<{ key: keyof QualityGate; max: number; step: number }> = [
    { key: "minTotal", max: 100, step: 1 },
    { key: "minHook", max: 100, step: 1 },
    { key: "minImpact", max: 100, step: 1 },
    { key: "minCta", max: 100, step: 1 },
    { key: "minAnyItem", max: 100, step: 1 },
    { key: "minRetention3s", max: 100, step: 1 },
    { key: "maxRepeats", max: 10, step: 1 },
    { key: "maxAvgCut", max: 6, step: 0.1 },
  ];

  return (
    <section className="panel mt-8 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Reglas de aprobación del short</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El video solo se genera y se publica si el checklist supera estos umbrales (gancho,
            impacto, ritmo, repeticiones y CTA). Si no los pasa, el guion se reescribe y, si sigue
            fallando, queda bloqueado.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(DEFAULT_QUALITY_GATE)}>
          Restaurar valores
        </Button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {campos.map(({ key, max, step }) => (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="label-caps">{QUALITY_GATE_LABELS[key]}</p>
              <span className="text-sm font-semibold">{gate[key]}</span>
            </div>
            <Slider
              className="mt-3"
              value={[gate[key]]}
              min={key === "maxAvgCut" ? 1 : 0}
              max={max}
              step={step}
              onValueChange={(value) => onChange({ ...gate, [key]: value[0] ?? gate[key] })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Alerta accionable ante error de créditos/cuota del proveedor de IA. */
function ProviderAlert({
  raw,
  onRetry,
  reintentando,
}: {
  raw: string;
  onRetry: () => void;
  reintentando: boolean;
}) {
  const info = classifyProviderError(raw);
  return (
    <div className="panel mt-8 border-destructive/50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="space-y-2">
          <p className="font-semibold text-destructive">{info.titulo}</p>
          <p className="text-sm text-muted-foreground">{info.detalle}</p>
          <p className="text-xs text-muted-foreground/70">{raw}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {info.acciones.map((accion) =>
              accion.href ? (
                <Button key={accion.label} size="sm" variant="secondary" asChild>
                  <a href={accion.href} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" /> {accion.label}
                  </a>
                </Button>
              ) : (
                <Button key={accion.label} size="sm" disabled={reintentando} onClick={onRetry}>
                  {accion.label}
                </Button>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
