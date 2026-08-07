-- Tabla principal 'runs'
CREATE TABLE public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL CHECK (slot IN ('viral', 'general')),
  status text NOT NULL DEFAULT 'pending',
  topic text,
  topic_angle text,
  viral_score numeric,
  emotion text,
  master_prompt text,
  error text,
  triggered_by text NOT NULL DEFAULT 'manual',
  duration_ms numeric,
  dossier jsonb,
  storyboard jsonb NOT NULL DEFAULT '[]'::jsonb,
  video_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  quality jsonb,
  quality_score numeric,
  approved boolean NOT NULL DEFAULT false,
  video_url text,
  video_status text NOT NULL DEFAULT 'idle'
);

-- Tabla de candidatos de tendencias
CREATE TABLE public.trend_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  title text NOT NULL,
  channel text,
  views numeric NOT NULL DEFAULT 0,
  velocity numeric,
  score numeric,
  selected boolean NOT NULL DEFAULT false,
  source text NOT NULL,
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX idx_trend_candidates_run_id ON public.trend_candidates(run_id);
CREATE INDEX idx_runs_status ON public.runs(status);
CREATE INDEX idx_runs_slot ON public.runs(slot);
CREATE INDEX idx_runs_topic ON public.runs(topic);
CREATE INDEX idx_runs_topic_angle ON public.runs(topic_angle);

-- RLS (Row Level Security) para service_role (acceso completo)
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access runs"
  ON public.runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access trend_candidates"
  ON public.trend_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Storage buckets (ya creados, pero verificar permisos)
-- Si no existen, crear con:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('storyboards', 'storyboards', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);