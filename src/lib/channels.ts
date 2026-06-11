import { supabase } from "@/integrations/supabase/client";

export type Channel = {
  id: string;
  name: string;
  description: string;
  streamUrl: string;
  sortOrder: number;
  isActive: boolean;
};

type DbChannel = {
  id: string;
  name: string;
  description: string;
  stream_url: string;
  sort_order: number;
  is_active: boolean;
};

function fromDb(row: DbChannel): Channel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    streamUrl: row.stream_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export async function fetchActiveChannels(): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function fetchAllChannels(): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function createChannel(input: Omit<Channel, "id">) {
  const { error } = await supabase.from("channels").insert({
    name: input.name,
    description: input.description,
    stream_url: input.streamUrl,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  if (error) throw error;
}

export async function updateChannel(id: string, input: Partial<Omit<Channel, "id">>) {
  const patch: Partial<DbChannel> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.streamUrl !== undefined) patch.stream_url = input.streamUrl;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  const { error } = await supabase.from("channels").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteChannel(id: string) {
  const { error } = await supabase.from("channels").delete().eq("id", id);
  if (error) throw error;
}
