
-- Tighten messages insert
DROP POLICY IF EXISTS "messages insert anyone" ON public.messages;
CREATE POLICY "messages insert constrained" ON public.messages FOR INSERT TO anon, authenticated
  WITH CHECK (length(trim(name)) BETWEEN 1 AND 200 AND length(trim(body)) BETWEEN 1 AND 4000);

-- Drop public list policies — public buckets serve files via public URL regardless
DROP POLICY IF EXISTS "public read thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "public read posters" ON storage.objects;
DROP POLICY IF EXISTS "public read branding" ON storage.objects;
