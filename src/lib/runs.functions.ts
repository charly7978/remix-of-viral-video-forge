import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildAssFromGuion } from "./captions.server";

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

export const listRuns = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
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
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run, error } = await supabaseAdmin
      .from("runs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) throw new Error("Corrida no encontrada");

    const { data: candidates } = await supabaseAdmin
      .from("trend_candidates")
      .select("id, title, channel, views, velocity, source, url")
      .eq("run_id", data.id)
      .order("score", { ascending: false })
      .limit(30);

    const storyboard = (run.storyboard ?? []) as Array<{ numero: number; path: string }>;
    const frames: Array<{ numero: number; url: string }> = [];
    for (const frame of storyboard) {
      const { data: signed } = await supabaseAdmin.storage
        .from("storyboards")
        .createSignedUrl(frame.path, 3600);
      if (signed?.signedUrl) frames.push({ numero: frame.numero, url: signed.signedUrl });
    }

    let videoUrl: string | null = null;
    if (run.video_url) {
      const { data: signed } = await supabaseAdmin.storage
        .from("videos")
        .createSignedUrl(run.video_url, 3600);
      videoUrl = signed?.signedUrl ?? null;
    }

    return { run, candidates: candidates ?? [], frames, videoUrl };
  });

export const startRun = createServerFn({ method: "POST" })
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
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), retry: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run, error } = await supabaseAdmin
      .from("runs")
      .select(
        "id, master_prompt, dossier, storyboard, video_job_id, video_status, video_url",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!run) throw new Error("Corrida no encontrada");
    if (run.video_url && !data.retry) return { status: "completed", progress: 100 };

    const { startVideoJob, getVideoJob, downloadVideo, assembleVideo } =
      await import("./video.server");
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
          .update({
            video_job_id: jobId,
            video_status: "in_progress",
            video_url: null,
            error: null,
          })
          .eq("id", data.id);
        return { status: "in_progress", progress: job.progress ?? 0 };
      }

      // Render gratuito e ilimitado con ffmpeg: ensamblamos el video a partir del
      // storyboard (frames), la locución (TTS) y los subtítulos animados.
      if (jobId.startsWith("local:")) {
        const frames = (run.storyboard ?? []) as Array<{
          numero: number;
          path: string;
        }>;
        if (!frames || frames.length === 0) {
          await supabaseAdmin
            .from("runs")
            .update({ video_status: "failed", error: "Sin frames del storyboard para ensamblar." })
            .eq("id", data.id);
          return {
            status: "failed",
            progress: 0,
            message: "Sin frames del storyboard para ensamblar.",
          };
        }

        const dossier = (run.dossier ?? {}) as Record<string, unknown>;
        const guion = (dossier["guion"] ?? []) as Array<{
          desde_seg: number;
          hasta_seg: number;
          voz_en_off: string;
          texto_en_pantalla: string;
        }>;
        const voiceover = guion
          .map((g) => g.voz_en_off)
          .filter(Boolean)
          .join(" ");
        const durationSec =
          guion.length > 0
            ? Math.max(...guion.map((g) => Number(g.hasta_seg) || 0))
            : frames.length * 3;

        const { promises: fsp } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const nodePath = await import("node:path");
        const tmp = await fsp.mkdtemp(nodePath.join(tmpdir(), "vframes-"));
        const localFrames: Array<{ numero: number; path: string }> = [];
        for (const f of frames) {
          const { data: signed } = await supabaseAdmin.storage
            .from("storyboards")
            .createSignedUrl(f.path, 600);
          if (!signed?.signedUrl) continue;
          const res = await fetch(signed.signedUrl);
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          const local = nodePath.join(tmp, `plano-${f.numero}.png`);
          await fsp.writeFile(local, buf);
          localFrames.push({ numero: f.numero, path: local });
        }

        const assembleArgs: Parameters<typeof assembleVideo>[0] = {
          frames: localFrames,
          voiceover,
          durationSec,
          runId: data.id,
        };

        try {
          const assContent = await buildAssFromGuion(guion);
          const { promises: fsp } = await import("node:fs");
          const { tmpdir } = await import("node:os");
          const nodePath = await import("node:path");
          const tmp = await fsp.mkdtemp(nodePath.join(tmpdir(), "vframes-"));
          const assPath = nodePath.join(tmp, "subs.ass");
          await fsp.writeFile(assPath, assContent, "utf-8");
          assembleArgs.subtitles = assPath;
        } catch (assErr) {
          console.warn(`[runs] No se pudieron generar subtítulos ASS: ${assErr}`);
        }

        const bytes = await assembleVideo(assembleArgs);

        const videoPath = `${data.id}/short.mp4`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("videos")
          .upload(videoPath, bytes, { contentType: "video/mp4", upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        await supabaseAdmin
          .from("runs")
          .update({ video_url: videoPath, video_status: "completed", error: null })
          .eq("id", data.id);
        return { status: "completed", progress: 100 };
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

      if (job.status === "failed" || job.status === "blocked") {
        const { classifyProviderError } = await import("./ai-errors");
        const info = classifyProviderError(job.error ?? "El render de video falló.");
        await supabaseAdmin
          .from("runs")
          .update({ video_status: job.status, error: job.error ?? "El render de video falló." })
          .eq("id", data.id);
        return {
          status: job.status,
          progress: 0,
          message: job.error ?? "El render de video falló.",
          errorKind: info.kind,
        };
      }

      return { status: "in_progress", progress: job.progress ?? 0 };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Error de video";
      const { classifyProviderError } = await import("./ai-errors");
      const info = classifyProviderError(message);
      await supabaseAdmin
        .from("runs")
        .update({ video_status: info.kind === "credits" ? "no_credits" : "failed", error: message })
        .eq("id", data.id);
      return { status: "failed", progress: 0, message, errorKind: info.kind };
    }
  });

export const deleteRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
