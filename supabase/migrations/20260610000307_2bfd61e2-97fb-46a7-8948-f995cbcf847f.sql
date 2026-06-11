REVOKE EXECUTE ON FUNCTION public.get_cloud_iptv_channels(text) FROM anon, authenticated, service_role, PUBLIC;

CREATE TABLE IF NOT EXISTS public.cloud_iptv_public_channels (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  logo TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cloud_iptv_public_channels TO anon, authenticated;
GRANT ALL ON public.cloud_iptv_public_channels TO service_role;

ALTER TABLE public.cloud_iptv_public_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public cloud iptv channels" ON public.cloud_iptv_public_channels;
CREATE POLICY "Anyone can read public cloud iptv channels"
ON public.cloud_iptv_public_channels
FOR SELECT
TO anon, authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.sync_cloud_iptv_public_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.cloud_iptv_public_channels WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.is_active = true AND (NEW.target_licenses IS NULL OR cardinality(NEW.target_licenses) = 0) THEN
    INSERT INTO public.cloud_iptv_public_channels (id, name, url, logo, category, headers, sort_order, updated_at)
    VALUES (
      NEW.id,
      NEW.name,
      NEW.url,
      COALESCE(NEW.logo_url, ''),
      COALESCE(NEW.category, ''),
      COALESCE(NEW.headers, '{}'::jsonb),
      NEW.sort_order,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      url = EXCLUDED.url,
      logo = EXCLUDED.logo,
      category = EXCLUDED.category,
      headers = EXCLUDED.headers,
      sort_order = EXCLUDED.sort_order,
      updated_at = EXCLUDED.updated_at;
  ELSE
    DELETE FROM public.cloud_iptv_public_channels WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_cloud_iptv_public_channel_trg ON public.cloud_iptv_channels;
CREATE TRIGGER sync_cloud_iptv_public_channel_trg
AFTER INSERT OR UPDATE OR DELETE ON public.cloud_iptv_channels
FOR EACH ROW EXECUTE FUNCTION public.sync_cloud_iptv_public_channel();

INSERT INTO public.cloud_iptv_public_channels (id, name, url, logo, category, headers, sort_order, updated_at)
SELECT id, name, url, COALESCE(logo_url, ''), COALESCE(category, ''), COALESCE(headers, '{}'::jsonb), sort_order, now()
FROM public.cloud_iptv_channels
WHERE is_active = true AND (target_licenses IS NULL OR cardinality(target_licenses) = 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  url = EXCLUDED.url,
  logo = EXCLUDED.logo,
  category = EXCLUDED.category,
  headers = EXCLUDED.headers,
  sort_order = EXCLUDED.sort_order,
  updated_at = EXCLUDED.updated_at;