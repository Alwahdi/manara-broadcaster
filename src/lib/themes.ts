import { supabase } from "@/integrations/supabase/client";

export type Theme = {
  id: string;
  name: string;
  brandName: string;
  brandTagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  fontFamily: string;
  isActive: boolean;
  isPreset: boolean;
};

type DbTheme = {
  id: string; name: string; brand_name: string; brand_tagline: string;
  logo_url: string | null; favicon_url: string | null;
  primary_color: string; accent_color: string; bg_color: string;
  font_family: string; is_active: boolean; is_preset: boolean;
};

function fromDb(r: DbTheme): Theme {
  return {
    id: r.id, name: r.name, brandName: r.brand_name, brandTagline: r.brand_tagline,
    logoUrl: r.logo_url ?? "", faviconUrl: r.favicon_url ?? "",
    primaryColor: r.primary_color, accentColor: r.accent_color, bgColor: r.bg_color,
    fontFamily: r.font_family, isActive: r.is_active, isPreset: r.is_preset,
  };
}

export async function fetchActiveTheme(): Promise<Theme | null> {
  const { data, error } = await supabase
    .from("themes").select("*").eq("is_active", true).limit(1).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data as DbTheme) : null;
}

export async function fetchAllThemes(): Promise<Theme[]> {
  const { data, error } = await supabase.from("themes").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function activateTheme(id: string) {
  await supabase.from("themes").update({ is_active: false }).neq("id", id);
  const { error } = await supabase.from("themes").update({ is_active: true }).eq("id", id);
  if (error) throw error;
}

export type ThemeInput = Omit<Theme, "id" | "isPreset">;

export async function createTheme(input: ThemeInput) {
  const { error } = await supabase.from("themes").insert({
    name: input.name, brand_name: input.brandName, brand_tagline: input.brandTagline,
    logo_url: input.logoUrl, favicon_url: input.faviconUrl,
    primary_color: input.primaryColor, accent_color: input.accentColor, bg_color: input.bgColor,
    font_family: input.fontFamily, is_active: input.isActive,
  });
  if (error) throw error;
}

export async function updateTheme(id: string, patch: Partial<ThemeInput>) {
  const db: {
    name?: string; brand_name?: string; brand_tagline?: string;
    logo_url?: string; favicon_url?: string;
    primary_color?: string; accent_color?: string; bg_color?: string;
    font_family?: string; is_active?: boolean;
  } = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.brandName !== undefined) db.brand_name = patch.brandName;
  if (patch.brandTagline !== undefined) db.brand_tagline = patch.brandTagline;
  if (patch.logoUrl !== undefined) db.logo_url = patch.logoUrl;
  if (patch.faviconUrl !== undefined) db.favicon_url = patch.faviconUrl;
  if (patch.primaryColor !== undefined) db.primary_color = patch.primaryColor;
  if (patch.accentColor !== undefined) db.accent_color = patch.accentColor;
  if (patch.bgColor !== undefined) db.bg_color = patch.bgColor;
  if (patch.fontFamily !== undefined) db.font_family = patch.fontFamily;
  if (patch.isActive !== undefined) db.is_active = patch.isActive;
  const { error } = await supabase.from("themes").update(db).eq("id", id);
  if (error) throw error;
}

export async function deleteTheme(id: string) {
  const { error } = await supabase.from("themes").delete().eq("id", id);
  if (error) throw error;
}

/** Convert hex to oklch-compatible CSS variable string. We just use the hex directly via color-mix-safe vars. */
export function applyThemeToDocument(theme: Theme | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!theme) return;
  root.style.setProperty("--brand-primary", theme.primaryColor);
  root.style.setProperty("--brand-accent", theme.accentColor);
  root.style.setProperty("--brand-bg", theme.bgColor);
  document.title = `${theme.brandName} — ${theme.brandTagline || "بث محلي"}`;
}
