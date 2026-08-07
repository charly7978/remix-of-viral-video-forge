ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS quality jsonb,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_job_id text,
  ADD COLUMN IF NOT EXISTS video_status text NOT NULL DEFAULT 'idle';

CREATE POLICY "Authenticated users can read videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'videos');