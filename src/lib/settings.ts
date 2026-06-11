import { supabase } from "@/integrations/supabase/client";

export type SettingsMap = Record<string, unknown>;

export async function fetchSettings(): Promise<SettingsMap> {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) throw error;
  const map: SettingsMap = {};
  for (const row of data ?? []) map[(row as { key: string }).key] = (row as { value: unknown }).value;
  return map;
}

export async function updateSetting(key: string, value: unknown) {
  const { error } = await supabase.from("settings").upsert({ key, value: value as never });
  if (error) throw error;
}

export async function updateSettings(map: SettingsMap) {
  const rows = Object.entries(map).map(([key, value]) => ({ key, value: value as never }));
  const { error } = await supabase.from("settings").upsert(rows);
  if (error) throw error;
}

export function getString(s: SettingsMap, key: string, fallback = ""): string {
  const v = s[key];
  return typeof v === "string" ? v : fallback;
}
export function getBool(s: SettingsMap, key: string, fallback = false): boolean {
  const v = s[key];
  return typeof v === "boolean" ? v : fallback;
}
export function getNumber(s: SettingsMap, key: string, fallback = 0): number {
  const v = s[key];
  return typeof v === "number" ? v : fallback;
}
