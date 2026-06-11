
-- Grant admin role to the requested account (idempotent; no-op if user not yet created)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE u.email = 'abdullahalwahdi464@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Seed default public IPTV channels only if the table is empty
INSERT INTO public.cloud_iptv_channels (name, url, logo_url, category, headers, is_active, target_licenses, sort_order, notes)
SELECT * FROM (VALUES
  ('Al Jazeera Arabic', 'https://live-hls-web-aja.getaj.net/AJA/index.m3u8', 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Aljazeera.svg', 'إخبارية', '{}'::jsonb, true, NULL::text[], 1, 'قناة افتراضية للاختبار'),
  ('France 24 Arabic', 'https://static.france24.com/live/F24_AR_LO_HLS/live_web.m3u8', 'https://upload.wikimedia.org/wikipedia/commons/8/8e/FRANCE_24_logo_%282021%29.svg', 'إخبارية', '{}'::jsonb, true, NULL::text[], 2, 'قناة افتراضية للاختبار'),
  ('DW Arabic', 'https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8', 'https://upload.wikimedia.org/wikipedia/commons/c/cf/Deutsche_Welle_symbol_2012.svg', 'إخبارية', '{}'::jsonb, true, NULL::text[], 3, 'قناة افتراضية للاختبار')
) AS v(name, url, logo_url, category, headers, is_active, target_licenses, sort_order, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.cloud_iptv_channels);
