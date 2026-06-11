GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_iptv_channels TO authenticated;
GRANT ALL ON public.cloud_iptv_channels TO service_role;

CREATE OR REPLACE FUNCTION public.get_cloud_iptv_channels(_license_key text DEFAULT '')
RETURNS TABLE (
  id uuid,
  name text,
  url text,
  logo text,
  category text,
  headers jsonb,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH license_status AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.licenses l
      WHERE l.license_key = _license_key
        AND l.status = 'active'
        AND (l.expires_at IS NULL OR l.expires_at > now())
    ) AS ok
  )
  SELECT
    c.id,
    c.name,
    c.url,
    COALESCE(c.logo_url, '') AS logo,
    COALESCE(c.category, '') AS category,
    COALESCE(c.headers, '{}'::jsonb) AS headers,
    c.sort_order
  FROM public.cloud_iptv_channels c
  CROSS JOIN license_status ls
  WHERE c.is_active = true
    AND (
      c.target_licenses IS NULL
      OR cardinality(c.target_licenses) = 0
      OR (ls.ok AND _license_key = ANY(c.target_licenses))
    )
  ORDER BY c.sort_order ASC, c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_cloud_iptv_channels(text) TO anon, authenticated, service_role;