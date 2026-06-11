import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

type DbCategory = {
  id: string; name: string; slug: string;
  description: string | null; image_url: string | null; icon: string | null;
  sort_order: number; is_active: boolean;
};

function fromDb(r: DbCategory): Category {
  return {
    id: r.id, name: r.name, slug: r.slug,
    description: r.description ?? "", imageUrl: r.image_url ?? "", icon: r.icon ?? "",
    sortOrder: r.sort_order, isActive: r.is_active,
  };
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories").select("*").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchAllCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchCategoryBySlug(slug: string): Promise<Category | null> {
  const { data, error } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? fromDb(data as DbCategory) : null;
}

export type CategoryInput = Omit<Category, "id">;

export async function createCategory(input: CategoryInput) {
  const { error } = await supabase.from("categories").insert({
    name: input.name, slug: input.slug, description: input.description,
    image_url: input.imageUrl, icon: input.icon,
    sort_order: input.sortOrder, is_active: input.isActive,
  });
  if (error) throw error;
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>) {
  const db: {
    name?: string; slug?: string; description?: string; image_url?: string; icon?: string;
    sort_order?: number; is_active?: boolean;
  } = {};
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.slug !== undefined) db.slug = patch.slug;
  if (patch.description !== undefined) db.description = patch.description;
  if (patch.imageUrl !== undefined) db.image_url = patch.imageUrl;
  if (patch.icon !== undefined) db.icon = patch.icon;
  if (patch.sortOrder !== undefined) db.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) db.is_active = patch.isActive;
  const { error } = await supabase.from("categories").update(db).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}
