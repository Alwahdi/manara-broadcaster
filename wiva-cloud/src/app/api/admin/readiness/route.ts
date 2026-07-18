import { requireAdminRequest } from "@/lib/auth";
import { hmac } from "@/lib/crypto";
import { databaseReady } from "@/lib/db";
import { errorResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAdminRequest(request);
    const database = await databaseReady();
    const gatewayBase = process.env.WIVA_MEDIA_GATEWAY_URL?.trim();
    const secret = process.env.WIVA_PLAYBACK_SIGNING_SECRET?.trim();
    let gateway: { ok: boolean; latencyMs: number | null } = { ok: false, latencyMs: null };
    if (gatewayBase && secret) {
      const started = Date.now(); const ts = Math.floor(started / 1000);
      const url = new URL("/health", gatewayBase);
      url.searchParams.set("ts", String(ts)); url.searchParams.set("sig", hmac(`health.${ts}`, secret));
      try {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
        gateway = { ok: response.ok && Boolean((await response.json() as { ok?: boolean }).ok), latencyMs: Date.now() - started };
      } catch { gateway = { ok: false, latencyMs: Date.now() - started }; }
    }
    return Response.json({ ok: database && gateway.ok, database, gateway }, { status: database && gateway.ok ? 200 : 503, headers: { "cache-control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
