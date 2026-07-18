import { adminCookie, authenticateAdmin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, cleanText, errorResponse, jsonBody } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, "admin-login", 6);
    const body = await jsonBody<{ email?: unknown; password?: unknown }>(request, 8_000);
    const token = authenticateAdmin(cleanText(body.email, 254), cleanText(body.password, 512));
    return Response.json({ ok: true }, { headers: { "set-cookie": adminCookie(token), "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
