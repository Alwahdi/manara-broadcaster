import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkRole(userId: string | undefined) {
      if (!userId) {
        if (mounted) { setIsAdmin(false); setRoleChecked(true); }
        return;
      }
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        if (mounted) { setIsAdmin(!!data); setRoleChecked(true); }
      } catch {
        if (mounted) { setIsAdmin(false); setRoleChecked(true); }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess?.user) {
        setIsAdmin(false);
        setRoleChecked(true);
      } else {
        setRoleChecked(false);
        // defer to avoid deadlock
        setTimeout(() => { void checkRole(sess.user.id); }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      void checkRole(sess?.user?.id);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // While we still have a user but haven't confirmed their role yet, treat as loading
  // so the UI doesn't flash "no permissions" before the role query resolves.
  const adminLoading = !!user && !roleChecked;

  return { session, user, isAdmin, loading: loading || adminLoading };
}
