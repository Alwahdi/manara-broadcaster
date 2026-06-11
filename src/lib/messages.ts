import { supabase } from "@/integrations/supabase/client";

export type Message = {
  id: string; name: string; email: string; phone: string;
  subject: string; body: string; isRead: boolean; createdAt: string;
};

export async function submitMessage(input: { name: string; email?: string; phone?: string; subject?: string; body: string }) {
  const { error } = await supabase.from("messages").insert({
    name: input.name.trim(),
    email: (input.email ?? "").trim(),
    phone: (input.phone ?? "").trim(),
    subject: (input.subject ?? "").trim(),
    body: input.body.trim(),
  });
  if (error) throw error;
}

export async function fetchMessages(): Promise<Message[]> {
  const { data, error } = await supabase.from("messages").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as { id: string; name: string; email: string | null; phone: string | null; subject: string | null; body: string; is_read: boolean; created_at: string };
    return {
      id: row.id, name: row.name, email: row.email ?? "", phone: row.phone ?? "",
      subject: row.subject ?? "", body: row.body, isRead: row.is_read, createdAt: row.created_at,
    };
  });
}

export async function markMessageRead(id: string, read = true) {
  const { error } = await supabase.from("messages").update({ is_read: read }).eq("id", id);
  if (error) throw error;
}

export async function markAllMessagesRead() {
  const { error } = await supabase.from("messages").update({ is_read: true }).eq("is_read", false);
  if (error) throw error;
}

export async function deleteMessage(id: string) {
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) throw error;
}
