import { supabase } from "@/integrations/supabase/client";

export type License = {
  id: string;
  license_key: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  organization: string;
  plan: string;
  billing_cycle: string;
  max_channels: number;
  max_library_items: number;
  white_label: boolean;
  hardware_id: string;
  status: string;
  activated_at: string | null;
  expires_at: string | null;
  last_check_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export async function fetchLicenses(): Promise<License[]> {
  const { data, error } = await supabase.from("licenses").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as License[];
}

export async function createLicense(payload: Partial<License>) {
  const key = payload.license_key || generateLicenseKey();
  const { data, error } = await supabase.from("licenses").insert({ ...payload, license_key: key } as never).select().single();
  if (error) throw error;
  return data as License;
}

export async function updateLicense(id: string, patch: Partial<License>) {
  const { error } = await supabase.from("licenses").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteLicense(id: string) {
  const { error } = await supabase.from("licenses").delete().eq("id", id);
  if (error) throw error;
}

export function generateLicenseKey(): string {
  const seg = () => Math.random().toString(36).slice(2, 7).toUpperCase();
  return `MNRA-${seg()}-${seg()}-${seg()}-${seg()}`;
}
