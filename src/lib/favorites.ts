import { supabase } from "@/integrations/supabase/client";

export async function fetchFavoriteIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("favorites").select("media_id").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { media_id: string }).media_id);
}

export async function toggleFavorite(userId: string, mediaId: string, on: boolean) {
  if (on) {
    const { error } = await supabase.from("favorites").insert({ user_id: userId, media_id: mediaId });
    if (error && !/duplicate/i.test(error.message)) throw error;
  } else {
    const { error } = await supabase.from("favorites").delete().eq("user_id", userId).eq("media_id", mediaId);
    if (error) throw error;
  }
}

export async function recordView(userId: string, mediaId: string, progress: number, completed = false) {
  const { error } = await supabase.from("views").insert({
    user_id: userId, media_id: mediaId, progress_seconds: Math.floor(progress), completed,
  });
  if (error) throw error;
}
