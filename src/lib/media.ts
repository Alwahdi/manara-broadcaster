import { supabase } from "@/integrations/supabase/client";

export type Media = {
  id: string;
  title: string;
  categoryId: string | null;
  pathId: string | null;
  kind: string;
  durationSeconds: number;
  posterUrl: string;
  thumbnailUrl: string;
  hlsUrl: string;
  downloadUrl: string;
  overview: string;
  year: number | null;
  tmdbId: string;
  addedAt: string;
  isActive: boolean;
};

type DbMedia = {
  id: string;
  title: string;
  category_id: string | null;
  path_id: string | null;
  kind: string;
  duration_seconds: number | null;
  poster_url: string | null;
  thumbnail_url: string | null;
  hls_url: string | null;
  download_url: string | null;
  overview: string | null;
  year: number | null;
  tmdb_id: string | null;
  added_at: string;
  is_active: boolean;
};

function fromDb(r: DbMedia): Media {
  return {
    id: r.id,
    title: r.title,
    categoryId: r.category_id,
    pathId: r.path_id,
    kind: r.kind,
    durationSeconds: r.duration_seconds ?? 0,
    posterUrl: r.poster_url ?? "",
    thumbnailUrl: r.thumbnail_url ?? "",
    hlsUrl: r.hls_url ?? "",
    downloadUrl: r.download_url ?? "",
    overview: r.overview ?? "",
    year: r.year,
    tmdbId: r.tmdb_id ?? "",
    addedAt: r.added_at,
    isActive: r.is_active,
  };
}

export async function fetchRecentMedia(limit = 20): Promise<Media[]> {
  const { data, error } = await supabase
    .from("media")
    .select("*")
    .eq("is_active", true)
    .order("added_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchMediaByCategory(categoryId: string, limit = 50): Promise<Media[]> {
  const { data, error } = await supabase
    .from("media")
    .select("*")
    .eq("is_active", true)
    .eq("category_id", categoryId)
    .order("added_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchMediaById(id: string): Promise<Media | null> {
  const { data, error } = await supabase.from("media").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data as DbMedia) : null;
}

export async function fetchAllMedia(): Promise<Media[]> {
  const { data, error } = await supabase.from("media").select("*").order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function deleteMedia(id: string) {
  const { error } = await supabase.from("media").delete().eq("id", id);
  if (error) throw error;
}

export async function updateMedia(id: string, patch: Partial<{ title: string; overview: string; posterUrl: string; categoryId: string | null; isActive: boolean }>) {
  const dbPatch: {
    title?: string; overview?: string; poster_url?: string;
    category_id?: string | null; is_active?: boolean;
  } = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.overview !== undefined) dbPatch.overview = patch.overview;
  if (patch.posterUrl !== undefined) dbPatch.poster_url = patch.posterUrl;
  if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId;
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;
  const { error } = await supabase.from("media").update(dbPatch).eq("id", id);
  if (error) throw error;
}
