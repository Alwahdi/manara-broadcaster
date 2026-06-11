// Server function: ensure admin account (admin@teranet.local / admin123) exists and has admin role.
import { createServerFn } from "@tanstack/react-start";

const ADMIN_EMAIL = "admin@teranet.local";
const ADMIN_PASSWORD = "admin123";

export const ensureAdminAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Try to find existing user
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL);

  if (!user) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    user = created.user;
  } else {
    // Reset password to expected and ensure confirmed
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
  }

  if (!user) throw new Error("Failed to ensure admin user");

  // Grant admin role if missing
  const { data: existingRole } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!existingRole) {
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "admin" });
  }

  return { email: ADMIN_EMAIL };
});
