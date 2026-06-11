import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const Channel = z.record(z.string(), z.unknown());
const Body = z.object({
  key: z.string().min(8).max(128),
  hardwareId: z.string().min(8).max(128),
  appVersion: z.string().max(32).optional(),
  mode: z.enum(["pull", "merge"]).default("merge"),
  state: z.object({
    settings: z.record(z.string(), z.unknown()).default({}),
    broadcast_channels: z.array(Channel).default([]),
    local_iptv_channels: z.array(Channel).default([]),
  }).optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function isActiveLicense(lic: { status: string; expires_at: string | null }) {
  return lic.status === "active" && (!lic.expires_at || new Date(lic.expires_at).getTime() > Date.now());
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

export const Route = createFileRoute("/api/public/device-state")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return json(400, { ok: false, error: "invalid_request" });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: lic, error: licError } = await supabaseAdmin
          .from("licenses")
          .select("id, status, expires_at, hardware_id")
          .eq("license_key", body.key)
          .maybeSingle();

        if (licError || !lic) return json(404, { ok: false, error: "license_not_found" });
        if (!isActiveLicense(lic)) return json(403, { ok: false, error: "license_inactive" });
        if (lic.hardware_id && lic.hardware_id !== body.hardwareId) {
          return json(409, { ok: false, error: "hardware_mismatch" });
        }

        if (!lic.hardware_id) {
          await supabaseAdmin.from("licenses").update({ hardware_id: body.hardwareId }).eq("id", lic.id);
        }

        const { data: existing, error: existingError } = await supabaseAdmin
          .from("client_device_state")
          .select("settings, broadcast_channels, local_iptv_channels")
          .eq("license_key", body.key)
          .eq("hardware_id", body.hardwareId)
          .maybeSingle();

        if (existingError) return json(500, { ok: false, error: existingError.message });

        if (body.mode === "pull") {
          return json(200, { ok: true, state: existing ?? null });
        }

        const incoming = body.state ?? { settings: {}, broadcast_channels: [], local_iptv_channels: [] };
        const merged = {
          settings: { ...((existing?.settings as Record<string, unknown> | null) ?? {}), ...incoming.settings },
          broadcast_channels: incoming.broadcast_channels.length
            ? incoming.broadcast_channels
            : ((existing?.broadcast_channels as unknown[]) ?? []),
          local_iptv_channels: incoming.local_iptv_channels.length
            ? incoming.local_iptv_channels
            : ((existing?.local_iptv_channels as unknown[]) ?? []),
        };

        const { error: upsertError } = await supabaseAdmin.from("client_device_state").upsert({
          license_key: body.key,
          hardware_id: body.hardwareId,
          app_version: body.appVersion ?? "",
          settings: asJson(merged.settings),
          broadcast_channels: asJson(merged.broadcast_channels),
          local_iptv_channels: asJson(merged.local_iptv_channels),
          last_pulled_at: new Date().toISOString(),
        }, { onConflict: "license_key,hardware_id" });

        if (upsertError) return json(500, { ok: false, error: upsertError.message });
        return json(200, { ok: true, state: merged });
      },
    },
  },
});