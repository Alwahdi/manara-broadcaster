import { supabase } from "@/integrations/supabase/client";

export type CloudIptvChannel = {
  id: string;
  name: string;
  url: string;
  logoUrl: string;
  category: string;
  headers: Record<string, string>;
  isActive: boolean;
  targetLicenses: string[] | null;
  sortOrder: number;
  notes: string;
};

type Row = {
  id: string;
  name: string;
  url: string;
  logo_url: string | null;
  category: string | null;
  headers: Record<string, string> | null;
  is_active: boolean;
  target_licenses: string[] | null;
  sort_order: number;
  notes: string | null;
};

function fromRow(r: Row): CloudIptvChannel {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    logoUrl: r.logo_url ?? "",
    category: r.category ?? "",
    headers: r.headers ?? {},
    isActive: r.is_active,
    targetLicenses: r.target_licenses,
    sortOrder: r.sort_order,
    notes: r.notes ?? "",
  };
}

export async function fetchAllCloudIptv(): Promise<CloudIptvChannel[]> {
  const { data, error } = await supabase
    .from("cloud_iptv_channels")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as Row));
}

export type CloudIptvInput = Omit<CloudIptvChannel, "id">;

export async function createCloudIptv(input: CloudIptvInput): Promise<void> {
  const { error } = await supabase.from("cloud_iptv_channels").insert({
    name: input.name,
    url: input.url,
    logo_url: input.logoUrl,
    category: input.category,
    headers: input.headers,
    is_active: input.isActive,
    target_licenses: input.targetLicenses,
    sort_order: input.sortOrder,
    notes: input.notes,
  });
  if (error) throw error;
}

export async function updateCloudIptv(id: string, patch: Partial<CloudIptvInput>): Promise<void> {
  const row = {
    name: patch.name,
    url: patch.url,
    logo_url: patch.logoUrl,
    category: patch.category,
    headers: patch.headers,
    is_active: patch.isActive,
    target_licenses: patch.targetLicenses,
    sort_order: patch.sortOrder,
    notes: patch.notes,
  };
  const { error } = await supabase.from("cloud_iptv_channels").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteCloudIptv(id: string): Promise<void> {
  const { error } = await supabase.from("cloud_iptv_channels").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Parse a basic M3U/M3U8 playlist into channel inputs.
 * Supports #EXTINF lines with optional tvg-logo and group-title attrs.
 */
export function parseM3U(text: string): Array<{ name: string; url: string; logoUrl: string; category: string }> {
  const lines = text.split(/\r?\n/);
  const out: Array<{ name: string; url: string; logoUrl: string; category: string }> = [];
  let pending: { name: string; logoUrl: string; category: string } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");
      const name = comma >= 0 ? line.slice(comma + 1).trim() : "Channel";
      const logo = /tvg-logo="([^"]+)"/i.exec(line)?.[1] ?? "";
      const group = /group-title="([^"]+)"/i.exec(line)?.[1] ?? "";
      pending = { name, logoUrl: logo, category: group };
    } else if (!line.startsWith("#")) {
      if (pending) {
        out.push({ ...pending, url: line });
        pending = null;
      } else {
        out.push({ name: line, url: line, logoUrl: "", category: "" });
      }
    }
  }
  return out;
}
