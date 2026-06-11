import { supabase } from "@/integrations/supabase/client";

export type SubscriberNetwork = {
  id: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  logo_url: string;
  website: string;
  plan: string;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function fetchVisibleNetworks(): Promise<SubscriberNetwork[]> {
  const { data, error } = await supabase
    .from("subscriber_networks")
    .select("*")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SubscriberNetwork[];
}

export async function fetchAllNetworks(): Promise<SubscriberNetwork[]> {
  const { data, error } = await supabase
    .from("subscriber_networks")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SubscriberNetwork[];
}

export async function createNetwork(payload: Partial<SubscriberNetwork>) {
  const { error } = await supabase.from("subscriber_networks").insert(payload as never);
  if (error) throw error;
}

export async function updateNetwork(id: string, patch: Partial<SubscriberNetwork>) {
  const { error } = await supabase.from("subscriber_networks").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteNetwork(id: string) {
  const { error } = await supabase.from("subscriber_networks").delete().eq("id", id);
  if (error) throw error;
}
