import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-License-Key",
};

export const Route = createFileRoute("/api/public/iptv/list")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const licenseKey =
          url.searchParams.get("license_key") ||
          request.headers.get("x-license-key") ||
          "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Optional: validate license (status must be active and not expired) but don't block test calls
        let licenseOk = false;
        if (licenseKey) {
          const { data: lic } = await supabaseAdmin
            .from("licenses")
            .select("status, expires_at")
            .eq("license_key", licenseKey)
            .maybeSingle();
          if (lic && lic.status === "active") {
            if (!lic.expires_at || new Date(lic.expires_at as string).getTime() > Date.now()) {
              licenseOk = true;
            }
          }
        }

        const { data, error } = await supabaseAdmin
          .from("cloud_iptv_channels")
          .select("id, name, url, logo_url, category, headers, target_licenses, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const filtered = (data ?? []).filter((row) => {
          const tl = row.target_licenses as string[] | null;
          if (!tl || tl.length === 0) return true;
          return licenseOk && tl.includes(licenseKey);
        });

        const channels = filtered.map((r) => ({
          id: r.id,
          name: r.name,
          url: r.url,
          logo: r.logo_url ?? "",
          category: r.category ?? "",
          headers: r.headers ?? {},
        }));

        return new Response(JSON.stringify({ ok: true, license_ok: licenseOk, channels }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            ...CORS,
          },
        });
      },
    },
  },
});
