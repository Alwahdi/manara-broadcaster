CREATE TABLE IF NOT EXISTS public.client_device_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key text NOT NULL,
  hardware_id text NOT NULL,
  app_version text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  broadcast_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  local_iptv_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_pulled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_key, hardware_id)
);

GRANT ALL ON public.client_device_state TO service_role;

ALTER TABLE public.client_device_state ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER set_client_device_state_updated_at
BEFORE UPDATE ON public.client_device_state
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_client_device_state_license_hardware
ON public.client_device_state (license_key, hardware_id);