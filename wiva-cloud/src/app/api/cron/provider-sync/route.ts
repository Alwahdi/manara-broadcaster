import { createHash, timingSafeEqual } from "node:crypto";
import { syncDueProviderSeries } from "@/lib/provider-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !token) return false;
  const expected = createHash("sha256").update(secret).digest();
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401, headers: { "cache-control": "no-store" } });
  const result = await syncDueProviderSeries();
  return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
}
