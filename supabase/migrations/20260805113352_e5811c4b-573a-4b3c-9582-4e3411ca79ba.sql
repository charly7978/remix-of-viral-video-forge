CREATE POLICY "Authenticated can read storyboards"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'storyboards');