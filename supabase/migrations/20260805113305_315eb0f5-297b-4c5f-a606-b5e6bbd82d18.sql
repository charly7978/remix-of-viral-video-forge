CREATE TYPE public.run_slot AS ENUM ('viral', 'general');
CREATE TYPE public.run_status AS ENUM ('pending', 'sensing', 'analyzing', 'writing', 'rendering', 'done', 'error');

CREATE TABLE public.runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot public.run_slot NOT NULL,
  status public.run_status NOT NULL DEFAULT 'pending',
  topic TEXT,
  topic_angle TEXT,
  viral_score NUMERIC,
  emotion TEXT,
  dossier JSONB,
  master_prompt TEXT,
  storyboard JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_url TEXT,
  error TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.runs TO authenticated;
GRANT ALL ON public.runs TO service_role;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read runs" ON public.runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create runs" ON public.runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update runs" ON public.runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete runs" ON public.runs FOR DELETE TO authenticated USING (true);

CREATE TABLE public.trend_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  channel TEXT,
  views BIGINT NOT NULL DEFAULT 0,
  velocity NUMERIC,
  score NUMERIC,
  source TEXT NOT NULL DEFAULT 'youtube',
  url TEXT,
  selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trend_candidates TO authenticated;
GRANT ALL ON public.trend_candidates TO service_role;
ALTER TABLE public.trend_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read candidates" ON public.trend_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write candidates" ON public.trend_candidates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_runs_created_at ON public.runs (created_at DESC);
CREATE INDEX idx_candidates_run ON public.trend_candidates (run_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER runs_touch_updated_at
BEFORE UPDATE ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();