import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy } from "lucide-react";
import { getRun } from "@/lib/runs.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/corrida/$runId")({
  head: () => ({
    meta: [
      { title: "Dossier de producción | Radar Viral AR" },
      {
        name: "description",
        content:
          "Guion segundo a segundo, planos, prompt maestro y datos de publicación del short generado por los agentes.",
      },
      { property: "og:title", content: "Dossier de producción | Radar Viral AR" },
      {
        property: "og:description",
        content: "Todo el paquete técnico del short: gancho, guion, planos y prompt maestro.",
      },
    ],
  }),
  component: RunDetail,
});

type Dict = Record<string, unknown>;

const dict = (value: unknown): Dict => (value && typeof value === "object" ? (value as Dict) : {});
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function copy(value: string) {
  void navigator.clipboard.writeText(value);
  toast.success("Copiado al portapapeles");
}

function RunDetail() {
  const { runId } = Route.useParams();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const fetchRun = useServerFn(getRun);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => fetchRun({ data: { id: runId } }),
    enabled: Boolean(session),
  });

  if (query.isLoading || !query.data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="label-caps">{query.isError ? "No se pudo cargar" : "Cargando dossier…"}</p>
      </main>
    );
  }

  const run = dict(query.data.run);
  const dossier = dict(run["dossier"]);
  const seleccion = dict(dossier["seleccion"]);
  const hook = dict(dossier["hook"]);
  const retencion = dict(dossier["arquitectura_de_retencion"]);
  const publicacion = dict(dossier["publicacion"]);
  const audio = dict(dossier["audio"]);
  const monetizacion = dict(dossier["monetizacion"]);
  const masterPrompt = text(run["master_prompt"]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <Link to="/" className="label-caps inline-flex items-center gap-2 hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Volver al panel
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={run["slot"] === "viral" ? "default" : "secondary"}>
            {run["slot"] === "viral" ? "Tema del momento" : "Interés general"}
          </Badge>
          {typeof run["viral_score"] === "number" ? (
            <span className="label-caps">Puntaje {Math.round(run["viral_score"])}/100</span>
          ) : null}
        </div>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">{text(run["topic"]) || "Sin tema"}</h1>
        <p className="mt-2 text-muted-foreground">{text(run["topic_angle"])}</p>
      </header>

      {text(run["error"]) ? (
        <p className="panel mt-6 border-destructive/50 p-5 text-sm text-destructive">
          {text(run["error"])}
        </p>
      ) : null}

      <Tabs defaultValue="guion" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="guion">Guion</TabsTrigger>
          <TabsTrigger value="prompt">Prompt maestro</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="publicacion">Publicación</TabsTrigger>
          <TabsTrigger value="inteligencia">Inteligencia</TabsTrigger>
        </TabsList>

        <TabsContent value="guion" className="space-y-4">
          <Panel title="Gancho (0 a 3 segundos)">
            <Field label="Voz en off" value={text(hook["voz_en_off"])} />
            <Field label="Texto en pantalla" value={text(hook["texto_en_pantalla"])} />
            <Field label="Acción visual" value={text(hook["accion_visual"])} />
            <Field label="Sonido" value={text(hook["sonido"])} />
            <Field label="Por qué frena el scroll" value={text(hook["por_que_frena_el_scroll"])} />
          </Panel>

          <Panel title="Guion segundo a segundo">
            <div className="space-y-3">
              {list(dossier["guion"]).map((raw, index) => {
                const beat = dict(raw);
                return (
                  <div key={index} className="rounded-md border border-border bg-secondary/40 p-4">
                    <p className="label-caps">
                      {String(beat["desde_seg"] ?? "?")}s → {String(beat["hasta_seg"] ?? "?")}s ·{" "}
                      {text(beat["emocion"])}
                    </p>
                    <p className="mt-2 text-sm">{text(beat["voz_en_off"])}</p>
                    <p className="mt-2 text-sm text-primary">{text(beat["texto_en_pantalla"])}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{text(beat["plano"])}</p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Arquitectura de retención">
            <Field label="Patrón de corte" value={text(retencion["patron_de_corte"])} />
            <Field label="Momento de giro" value={text(retencion["momento_de_giro"])} />
            <Field label="Loop final" value={text(retencion["loop_final"])} />
            <Field
              label="Disparador de comentarios"
              value={text(retencion["disparador_de_comentarios"])}
            />
          </Panel>

          <Panel title="Audio">
            <Field label="Estilo de voz" value={text(audio["estilo_de_voz"])} />
            <Field label="Música" value={text(audio["musica"])} />
            <Field label="Efectos" value={text(audio["efectos"])} />
            <Field label="Ritmo" value={text(audio["ritmo"])} />
          </Panel>
        </TabsContent>

        <TabsContent value="prompt">
          <Panel
            title="Prompt maestro para el generador de video"
            action={
              masterPrompt ? (
                <Button size="sm" variant="secondary" onClick={() => copy(masterPrompt)}>
                  <Copy className="size-3.5" /> Copiar
                </Button>
              ) : null
            }
          >
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {masterPrompt || "Sin prompt generado."}
            </pre>
          </Panel>
        </TabsContent>

        <TabsContent value="planos" className="space-y-4">
          {query.data.frames.length > 0 ? (
            <Panel title="Storyboard">
              <div className="grid gap-4 sm:grid-cols-3">
                {query.data.frames.map((frame) => (
                  <figure key={frame.numero}>
                    <img
                      src={frame.url}
                      alt={`Cuadro de referencia del plano ${frame.numero}`}
                      className="w-full rounded-md border border-border"
                      loading="lazy"
                    />
                    <figcaption className="label-caps mt-2">Plano {frame.numero}</figcaption>
                  </figure>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel title="Lista de planos">
            <div className="space-y-3">
              {list(dossier["planos"]).map((raw, index) => {
                const plano = dict(raw);
                const prompt = text(plano["prompt_generacion"]);
                return (
                  <div key={index} className="rounded-md border border-border bg-secondary/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="label-caps">
                        Plano {String(plano["numero"] ?? index + 1)} ·{" "}
                        {String(plano["duracion_seg"] ?? "?")}s
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => copy(prompt)}>
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                    <p className="mt-2 font-mono text-xs leading-relaxed">{prompt}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {text(plano["movimiento_camara"])} · {text(plano["iluminacion"])}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="publicacion" className="space-y-4">
          <Panel title="YouTube Shorts">
            <Field label="Título" value={text(publicacion["titulo_youtube"])} copyable />
            <Field label="Descripción" value={text(publicacion["descripcion_youtube"])} copyable />
            <Field label="Tags" value={list(publicacion["tags_youtube"]).join(", ")} copyable />
          </Panel>
          <Panel title="TikTok">
            <Field label="Caption" value={text(publicacion["caption_tiktok"])} copyable />
            <Field label="Hashtags" value={list(publicacion["hashtags"]).join(" ")} copyable />
          </Panel>
          <Panel title="Miniatura y horario">
            <Field label="Mejor horario (AR)" value={text(publicacion["mejor_horario_ar"])} />
            <Field label="Texto de miniatura" value={text(publicacion["texto_miniatura"])} />
            <Field label="Prompt de miniatura" value={text(publicacion["prompt_miniatura"])} copyable />
          </Panel>
          <Panel title="Monetización">
            <Field label="Ángulo comercial" value={text(monetizacion["angulo_comercial"])} />
            <Field label="Llamado a la acción" value={text(monetizacion["llamado_a_la_accion"])} />
            <Field
              label="Riesgo de desmonetización"
              value={text(monetizacion["riesgo_de_desmonetizacion"])}
            />
          </Panel>
          <Panel title="Video final">
            {run["video_url"] ? (
              <>
                <Field label="URL del video" value={text(run["video_url"])} copyable />
                <div className="mt-4">
                  <video
                    src={text(run["video_url"])}
                    controls
                    className="w-full rounded-md border border-border"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Video final no disponible o aún no generado.</p>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="inteligencia" className="space-y-4">
          <Panel title="Por qué este tema">
            <Field label="Por qué ahora" value={text(seleccion["por_que_ahora"])} />
            <Field label="Ventana de oportunidad" value={text(seleccion["ventana_de_oportunidad"])} />
            <Field label="Audiencia" value={text(seleccion["audiencia"])} />
            <Field label="Competencia" value={text(seleccion["saturacion_competencia"])} />
            <Field
              label="Datos verificables"
              value={list(seleccion["datos_verificables"]).join(" · ")}
            />
            <Field label="Riesgos" value={list(seleccion["riesgos"]).join(" · ")} />
          </Panel>

          <Panel title="Candidatos sensados">
            <div className="space-y-2">
              {query.data.candidates.map((candidate) => (
                <a
                  key={candidate.id}
                  href={candidate.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-4 rounded-md border border-border bg-secondary/40 p-3 text-sm hover:border-primary/60"
                >
                  <span className="line-clamp-1">{candidate.title}</span>
                  <span className="label-caps shrink-0">
                    {candidate.views ? `${candidate.views.toLocaleString("es-AR")} vistas` : candidate.source}
                  </span>
                </a>
              ))}
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel mt-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="label-caps">{label}</p>
        {copyable ? (
          <button
            type="button"
            onClick={() => copy(value)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Copiar ${label}`}
          >
            <Copy className="size-3" />
          </button>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}
