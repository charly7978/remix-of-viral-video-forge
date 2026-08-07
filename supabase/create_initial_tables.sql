-- Initial schema creation for Supabase database

-- Run this in Supabase SQL Editor to create required tables

-- 1. Create enum types for run status and slot
CREATE TYPE public.run_status AS ENUM ('pending', 'sensing', 'analyzing', 'writing', 'rendering', 'done', 'error');
CREATE TYPE public.run_slot AS ENUM ('viral', 'general');

-- 2. Main runs table (main production runs)
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
  video_job_id text,
  video_status text NOT NULL DEFAULT 'idle'
);

-- 3. Trend candidates table (for tracking potential viral topics)
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

-- Indexes for performance
CREATE INDEX idx_trend_candidates_run_id ON public.trend_candidates(run_id);
CREATE INDEX idx_runs_status ON public.runs(status);
CREATE INDEX idx_runs_slot ON public.runs(slot);
CREATE INDEX idx_runs_topic ON public.runs(topic);
CREATE INDEX idx_runs_topic_angle ON public.runs(topic_angle);

-- 4. Storage buckets (already created via API, but verify in Supabase UI)
-- These are managed separately in Supabase Storage UI

-- Optional: Create RLS policies for service_role (admin) access
-- (Already handled by service_role key usage in code)

-- Note: Run this in Supabase SQL Editor after creating buckets