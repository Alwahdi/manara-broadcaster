import { supabase } from "@/integrations/supabase/client";

export type Block = { id: string; kind: string; value: string; reason: string; createdAt: string };
export type LogEntry = { id: string; event: string; details: unknown; createdAt: string };

export async function fetchBlocks(): Promise<Block[]> {
  const { data, error } = await supabase.from("blocks").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as { id: string; kind: string; value: string; reason: string | null; created_at: string };
    return { id: row.id, kind: row.kind, value: row.value, reason: row.reason ?? "", createdAt: row.created_at };
  });
}

export async function createBlock(input: { kind: string; value: string; reason?: string }) {
  const { error } = await supabase.from("blocks").insert({ kind: input.kind, value: input.value, reason: input.reason ?? "" });
  if (error) throw error;
}

export async function deleteBlock(id: string) {
  const { error } = await supabase.from("blocks").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchLogs(limit = 200): Promise<LogEntry[]> {
  const { data, error } = await supabase.from("logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as { id: string; event: string; details: unknown; created_at: string };
    return { id: row.id, event: row.event, details: row.details, createdAt: row.created_at };
  });
}
