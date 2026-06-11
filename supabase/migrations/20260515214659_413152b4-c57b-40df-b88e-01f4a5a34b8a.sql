INSERT INTO storage.buckets (id, name, public) VALUES ('releases', 'releases', true) ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read for releases (anyone can download installers + latest.yml)
DO $$ BEGIN
  CREATE POLICY "releases public read" ON storage.objects FOR SELECT USING (bucket_id = 'releases');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Admin write
DO $$ BEGIN
  CREATE POLICY "releases admin write" ON storage.objects FOR ALL TO authenticated
    USING (bucket_id = 'releases' AND has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (bucket_id = 'releases' AND has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;