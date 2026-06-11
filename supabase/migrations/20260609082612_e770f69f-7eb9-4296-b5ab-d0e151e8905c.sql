
CREATE TABLE public.cloud_iptv_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  logo_url TEXT DEFAULT '',
  category TEXT DEFAULT '',
  headers JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  target_licenses TEXT[] DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_iptv_channels TO authenticated;
GRANT ALL ON public.cloud_iptv_channels TO service_role;

ALTER TABLE public.cloud_iptv_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cloud iptv channels"
ON public.cloud_iptv_channels
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER cloud_iptv_channels_updated_at
BEFORE UPDATE ON public.cloud_iptv_channels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX cloud_iptv_channels_active_idx ON public.cloud_iptv_channels (is_active, sort_order);
