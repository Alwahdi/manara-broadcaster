
-- ============================================
-- ESTRAHA → TERANET MEGA MIGRATION
-- ============================================

-- 1. CATEGORIES ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text DEFAULT '',
  icon text DEFAULT '',
  image_url text DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT USING (is_active OR has_role(auth.uid(),'admin'));
CREATE POLICY "categories admin write" ON public.categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 2. PATHS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  path text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  thumbnail text DEFAULT '',
  kind text NOT NULL DEFAULT 'video',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  last_scan_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "paths admin all" ON public.paths FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 3. MEDIA ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id uuid REFERENCES public.paths(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  original_filename text DEFAULT '',
  relative_path text DEFAULT '',
  kind text NOT NULL DEFAULT 'video',
  duration_seconds int DEFAULT 0,
  size_bytes bigint DEFAULT 0,
  poster_url text DEFAULT '',
  thumbnail_url text DEFAULT '',
  tmdb_id text DEFAULT '',
  year int,
  overview text DEFAULT '',
  hls_url text DEFAULT '',
  download_url text DEFAULT '',
  is_public boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_category ON public.media(category_id);
CREATE INDEX IF NOT EXISTS idx_media_added ON public.media(added_at DESC);
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media public read" ON public.media FOR SELECT
  USING ((is_active AND is_public) OR has_role(auth.uid(),'admin'));
CREATE POLICY "media admin write" ON public.media FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 4. CHANNELS — extend existing table -----------------------------
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS source_kind text DEFAULT 'url';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS resolution text DEFAULT '1920x1080';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS fps int DEFAULT 30;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS bitrate_kbps int DEFAULT 4000;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS codec text DEFAULT 'h264';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS auto_start boolean DEFAULT false;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS poster_url text DEFAULT '';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS category text DEFAULT '';
UPDATE public.channels SET slug = lower(regexp_replace(coalesce(slug, name), '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL OR slug = '';

-- 5. FAVORITES + VIEWS --------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_id uuid NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, media_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites own" ON public.favorites FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_id uuid NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  progress_seconds int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  watched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_views_recent ON public.views(user_id, watched_at DESC);
ALTER TABLE public.views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "views own" ON public.views FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. MESSAGES ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text DEFAULT '',
  phone text DEFAULT '',
  subject text DEFAULT '',
  body text NOT NULL,
  ip text DEFAULT '',
  user_agent text DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages insert anyone" ON public.messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "messages admin read" ON public.messages FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "messages admin update" ON public.messages FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "messages admin delete" ON public.messages FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- 7. BLOCKS --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'ip',
  value text NOT NULL,
  reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind, value)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks admin all" ON public.blocks FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 8. LOCKED PATHS --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locked_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  path_id uuid REFERENCES public.paths(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.locked_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locked_paths admin all" ON public.locked_paths FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "locked_paths user read" ON public.locked_paths FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.locked_path_users (
  locked_path_id uuid NOT NULL REFERENCES public.locked_paths(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (locked_path_id, user_id)
);
ALTER TABLE public.locked_path_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lpu admin all" ON public.locked_path_users FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "lpu self read" ON public.locked_path_users FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 9. SETTINGS ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '""'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.settings FOR SELECT USING (true);
CREATE POLICY "settings admin write" ON public.settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 10. THEMES -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_name text NOT NULL DEFAULT 'TeraNet',
  brand_tagline text NOT NULL DEFAULT '',
  logo_url text DEFAULT '',
  favicon_url text DEFAULT '',
  primary_color text NOT NULL DEFAULT '#3b82f6',
  accent_color text NOT NULL DEFAULT '#8b5cf6',
  bg_color text NOT NULL DEFAULT '#0a0f1f',
  font_family text NOT NULL DEFAULT 'Cairo',
  is_active boolean NOT NULL DEFAULT false,
  is_preset boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "themes public read" ON public.themes FOR SELECT USING (true);
CREATE POLICY "themes admin write" ON public.themes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 11. TICKERS ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  url text DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickers public read" ON public.tickers FOR SELECT USING (is_active OR has_role(auth.uid(),'admin'));
CREATE POLICY "tickers admin write" ON public.tickers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 12. LOGS ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid,
  event text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_recent ON public.logs(created_at DESC);
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs admin read" ON public.logs FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "logs admin write" ON public.logs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- 13. STORAGE BUCKETS ---------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('media-thumbnails','media-thumbnails',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('media-posters','media-posters',true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('branding-assets','branding-assets',true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read thumbnails" ON storage.objects FOR SELECT USING (bucket_id = 'media-thumbnails');
CREATE POLICY "admin write thumbnails" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='media-thumbnails' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin update thumbnails" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='media-thumbnails' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete thumbnails" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='media-thumbnails' AND has_role(auth.uid(),'admin'));

CREATE POLICY "public read posters" ON storage.objects FOR SELECT USING (bucket_id = 'media-posters');
CREATE POLICY "admin write posters" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='media-posters' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin update posters" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='media-posters' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete posters" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='media-posters' AND has_role(auth.uid(),'admin'));

CREATE POLICY "public read branding" ON storage.objects FOR SELECT USING (bucket_id = 'branding-assets');
CREATE POLICY "admin write branding" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='branding-assets' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin update branding" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='branding-assets' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete branding" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='branding-assets' AND has_role(auth.uid(),'admin'));

-- 14. UPDATED_AT TRIGGERS -----------------------------------------
DO $$ BEGIN
  CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_paths_updated BEFORE UPDATE ON public.paths FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_media_updated BEFORE UPDATE ON public.media FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_themes_updated BEFORE UPDATE ON public.themes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 15. SEED DEFAULTS -----------------------------------------------
INSERT INTO public.settings (key, value) VALUES
  ('site_name', '"TeraNet"'::jsonb),
  ('site_tagline', '"شبكتك المحلية للبث والمكتبة"'::jsonb),
  ('hero_visible', 'true'::jsonb),
  ('hero_mode', '"auto"'::jsonb),
  ('hero_custom_title', '""'::jsonb),
  ('hero_custom_desc', '""'::jsonb),
  ('hero_custom_link', '""'::jsonb),
  ('hero_custom_btn_text', '"شاهد الآن"'::jsonb),
  ('show_carousel', 'true'::jsonb),
  ('carousel_speed', '50'::jsonb),
  ('carousel_direction', '"right"'::jsonb),
  ('show_ticker', 'true'::jsonb),
  ('ticker_color', '"primary"'::jsonb),
  ('new_item_days', '7'::jsonb),
  ('enable_download', 'true'::jsonb),
  ('show_live_links', 'true'::jsonb),
  ('show_section_images', 'true'::jsonb),
  ('download_speed_mbps', '100'::jsonb),
  ('stream_speed_mbps', '100'::jsonb),
  ('throttle_enabled', 'false'::jsonb),
  ('tmdb_api_key', '""'::jsonb),
  ('player_logo', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.themes (name, brand_name, brand_tagline, primary_color, accent_color, bg_color, is_active, is_preset)
VALUES ('TeraNet Default', 'TeraNet', 'بث محلي عبر شبكة Wi-Fi', '#3b82f6', '#8b5cf6', '#0a0f1f', true, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.categories (name, slug, sort_order) VALUES
  ('أفلام', 'movies', 1),
  ('مسلسلات', 'series', 2),
  ('كرتون', 'cartoon', 3),
  ('وثائقي', 'documentary', 4)
ON CONFLICT (slug) DO NOTHING;
