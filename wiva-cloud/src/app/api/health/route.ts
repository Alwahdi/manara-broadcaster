import { databaseConfigured, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "wiva-cloud-control-plane",
    demoMode: isDemoMode(),
    database: databaseConfigured() ? "configured" : "missing",
    mediaGateway: process.env.WIVA_MEDIA_GATEWAY_URL ? "configured" : "missing",
    admin: process.env.WIVA_ADMIN_EMAIL && process.env.WIVA_ADMIN_PASSWORD_HASH ? "configured" : "missing",
  }, { headers: { "cache-control": "no-store" } });
}
