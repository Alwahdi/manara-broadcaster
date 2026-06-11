import { supabase } from "@/integrations/supabase/client";

export type LibPath = {
  id: string; name: string; path: string; categoryId: string | null;
  kind: string; sortOrder: number; isActive: boolean; thumbnail: string;
};

type DbPath = {
  id: string; name: string; path: string; category_id: string | null;
  kind: string; sort_order: number; is_active: boolean; thumbnail: string | null;
};

function fromDb(r: DbPath): LibPath {
  return {
    id: r.id, name: r.name, path: r.path, categoryId: r.category_id,
    kind: r.kind, sortOrder: r.sort_order, isActive: r.is_active,
    thumbnail: r.thumbnail ?? "",
  };
}

export async function fetchAllPaths(): Promise<LibPath[]> {
  const { data, error } = await supabase.from("paths").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function createPath(input: Omit<LibPath, "id">) {
  const { error } = await supabase.from("paths").insert({
    name: input.name, path: input.path, category_id: input.categoryId,
    kind: input.kind, sort_order: input.sortOrder, is_active: input.isActive,
    thumbnail: input.thumbnail,
  });
  if (error) throw error;
}

export async function updatePath(id: string, patch: Partial<Omit<LibPath, "id">>) {
  const db: {
    name?: string; path?: string; category_id?: string | null; kind?: string;
    sort_order?: number; is_active?: boolean; thumbnail?: string;
  } = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.path !== undefined) db.path = patch.path;
  if (patch.categoryId !== undefined) db.category_id = patch.categoryId;
  if (patch.kind !== undefined) db.kind = patch.kind;
  if (patch.sortOrder !== undefined) db.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) db.is_active = patch.isActive;
  if (patch.thumbnail !== undefined) db.thumbnail = patch.thumbnail;
  const { error } = await supabase.from("paths").update(db).eq("id", id);
  if (error) throw error;
}

export async function deletePath(id: string) {
  const { error } = await supabase.from("paths").delete().eq("id", id);
  if (error) throw error;
}
