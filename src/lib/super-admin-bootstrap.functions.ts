// Bootstrap the cloud super admin (abdullahalwahdi464@gmail.com).
// Creates the auth user if missing, ensures password, ensures admin role.
import { createServerFn } from "@tanstack/react-start";

const SUPER_EMAIL = "abdullahalwahdi464@gmail.com";
const SUPER_PASSWORD = "Aa773032@";

export const ensureSuperAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Find user by email (scan up to 1000 users)
  let user: { id: string; email?: string } | null = null;
  for (let page = 1; page <= 5 && !user; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((u) => u.email?.toLowerCase() === SUPER_EMAIL) ?? null;
    if (data.users.length < 200) break;
  }

  if (!user) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: SUPER_EMAIL,
      password: SUPER_PASSWORD,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    user = created.user;
  } else {
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: SUPER_PASSWORD,
      email_confirm: true,
    });
  }

  if (!user) throw new Error("Failed to ensure super admin");

  const { data: existingRole } = await supabaseAdmin
    .from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!existingRole) {
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "admin" });
  }

  return { email: SUPER_EMAIL };
});
