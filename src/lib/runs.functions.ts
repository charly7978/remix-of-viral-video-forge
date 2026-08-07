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
}

export const listRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("runs")
      .select(
        "id, slot, status, topic, topic_angle, viral_score, emotion, master_prompt, error, triggered_by, duration_ms, created_at",
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

    let videoUrl = typeof run.video_url === "string" ? run.video_url : null;
    if (videoUrl && !videoUrl.startsWith("http")) {
      const { data: signedVideo } = await context.supabase.storage
        .from("videos")
        .createSignedUrl(videoUrl, 3600);
      if (signedVideo?.signedUrl) videoUrl = signedVideo.signedUrl;
    }

    return { run: { ...run, video_url: videoUrl }, candidates: candidates ?? [], frames };
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

export const deleteRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("runs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
