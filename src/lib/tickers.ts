import { supabase } from "@/integrations/supabase/client";

export type Ticker = { id: string; text: string; url: string; sortOrder: number; isActive: boolean };

type DbTicker = { id: string; text: string; url: string | null; sort_order: number; is_active: boolean };

function fromDb(r: DbTicker): Ticker {
  return { id: r.id, text: r.text, url: r.url ?? "", sortOrder: r.sort_order, isActive: r.is_active };
}

export async function fetchActiveTickers(): Promise<Ticker[]> {
  const { data, error } = await supabase
    .from("tickers").select("*").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchAllTickers(): Promise<Ticker[]> {
  const { data, error } = await supabase.from("tickers").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function createTicker(input: Omit<Ticker, "id">) {
  const { error } = await supabase.from("tickers").insert({
    text: input.text, url: input.url, sort_order: input.sortOrder, is_active: input.isActive,
  });
  if (error) throw error;
}

export async function updateTicker(id: string, patch: Partial<Omit<Ticker, "id">>) {
  const db: { text?: string; url?: string; sort_order?: number; is_active?: boolean } = {};
  if (patch.text !== undefined) db.text = patch.text;
  if (patch.url !== undefined) db.url = patch.url;
  if (patch.sortOrder !== undefined) db.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) db.is_active = patch.isActive;
  const { error } = await supabase.from("tickers").update(db).eq("id", id);
  if (error) throw error;
}

export async function deleteTicker(id: string) {
  const { error } = await supabase.from("tickers").delete().eq("id", id);
  if (error) throw error;
}
