
-- Licenses table for manual key issuance & verification
CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key text NOT NULL UNIQUE,
  customer_name text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  organization text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT 'trial', -- trial | basic | pro | enterprise | lifetime_basic | lifetime_pro | lifetime_enterprise
  billing_cycle text NOT NULL DEFAULT 'monthly', -- monthly | yearly | lifetime
  max_channels integer NOT NULL DEFAULT 2,
  max_library_items integer NOT NULL DEFAULT 50,
  white_label boolean NOT NULL DEFAULT false,
  hardware_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active', -- active | suspended | expired | revoked
  activated_at timestamptz,
  expires_at timestamptz,
  last_check_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "licenses admin all" ON public.licenses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER licenses_set_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_licenses_key ON public.licenses(license_key);
CREATE INDEX idx_licenses_status ON public.licenses(status);

-- Subscriber networks for the public map on landing page
CREATE TABLE public.subscriber_networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  logo_url text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT 'pro',
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriber_networks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriber_networks public read" ON public.subscriber_networks
  FOR SELECT TO public
  USING (is_visible OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "subscriber_networks admin write" ON public.subscriber_networks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER subscriber_networks_set_updated_at
  BEFORE UPDATE ON public.subscriber_networks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
