import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface RunRow {
  id: string;
  slot: "viral" | "general";
  status: string;
  topic: string | null;
  topic_angle: string | null;
  viral_score: number | null;
  emotion: string | null;
  master_prompt: string | null;
  error: string | null;
  triggered_by: string;
  duration_ms: number | null;
  created_at: string;
  quality_score: number | null;
  approved: boolean;
  video_status: string;
  video_url: string | null;
}

export const listRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("runs")
      .select(
        "id, slot, status, topic, topic_angle, viral_score, emotion, master_prompt, error, triggered_by, duration_ms, created_at, quality_score, approved, video_status, video_url",
      )
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) throw new Error(error.message);
    return (data ?? []) as RunRow[];
  });

export const getRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("runs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) throw new Error("Corrida no encontrada");

    const { data: candidates } = await context.supabase
      .from("trend_candidates")
      .select("id, title, channel, views, velocity, source, url")
      .eq("run_id", data.id)
      .order("score", { ascending: false })
      .limit(30);

    const storyboard = (run.storyboard ?? []) as Array<{ numero: number; path: string }>;
    const frames: Array<{ numero: number; url: string }> = [];
    for (const frame of storyboard) {
      const { data: signed } = await context.supabase.storage
        .from("storyboards")
        .createSignedUrl(frame.path, 3600);
      if (signed?.signedUrl) frames.push({ numero: frame.numero, url: signed.signedUrl });
    }

    let videoUrl: string | null = null;
    if (run.video_url) {
      const { data: signed } = await context.supabase.storage
        .from("videos")
        .createSignedUrl(run.video_url, 3600);
      videoUrl = signed?.signedUrl ?? null;
    }

    return { run, candidates: candidates ?? [], frames, videoUrl };
  });

export const startRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ slot: z.enum(["viral", "general"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { runProduction } = await import("./pipeline.server");
    const id = await runProduction(data.slot, "manual");
    return { id };
  });

/**
 * Avanza el render del video de una corrida: encola el trabajo si falta,
 * consulta el progreso y guarda el MP4 terminado. La interfaz la llama en bucle
 * para no depender de una única petición larga.
 */
export const advanceVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), retry: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: run, error } = await context.supabase
      .from("runs")
      .select("id, approved, master_prompt, dossier, video_job_id, video_status, video_url")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) throw new Error("Corrida no encontrada");
    if (run.video_url && !data.retry) return { status: "completed", progress: 100 };
    if (!run.approved) {
      return { status: "blocked", progress: 0, message: "El short no pasó el control de calidad." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startVideoJob, getVideoJob, downloadVideo } = await import("./video.server");
    const { videoPrompt } = await import("./pipeline.server");

    try {
      let jobId = run.video_job_id;
      if (!jobId || data.retry) {
        const prompt = videoPrompt(
          run.master_prompt ?? "",
          (run.dossier ?? {}) as Record<string, unknown>,
        );
        if (!prompt.trim()) throw new Error("La corrida no tiene prompt de video.");
        const job = await startVideoJob(prompt);
        jobId = job.id;
        await supabaseAdmin
          .from("runs")
          .update({ video_job_id: jobId, video_status: "in_progress", video_url: null, error: null })
          .eq("id", data.id);
        return { status: "in_progress", progress: job.progress ?? 0 };
      }

      const job = await getVideoJob(jobId);

      if (job.status === "completed") {
        const bytes = await downloadVideo(jobId);
        const path = `${data.id}/short.mp4`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("videos")
          .upload(path, bytes, { contentType: "video/mp4", upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        await supabaseAdmin
          .from("runs")
          .update({ video_url: path, video_status: "completed", error: null })
          .eq("id", data.id);
        return { status: "completed", progress: 100 };
      }

      if (job.status === "failed") {
        await supabaseAdmin
          .from("runs")
          .update({ video_status: "failed", error: job.error ?? "El render de video falló." })
          .eq("id", data.id);
        return { status: "failed", progress: 0, message: job.error ?? "El render de video falló." };
      }

      return { status: "in_progress", progress: job.progress ?? 0 };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Error de video";
      await supabaseAdmin.from("runs").update({ video_status: "failed", error: message }).eq("id", data.id);
      return { status: "failed", progress: 0, message };
    }
  });

export const deleteRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
