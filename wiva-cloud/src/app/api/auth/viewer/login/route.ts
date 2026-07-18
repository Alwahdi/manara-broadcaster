import { authenticateViewer, viewerCookie } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, cleanText, errorResponse, jsonBody } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    enforceRateLimit(request, "viewer-login", 8);
    const body = await jsonBody<{ email?: unknown; password?: unknown }>(request, 8_000);
    const result = await authenticateViewer(cleanText(body.email, 254), cleanText(body.password, 512));
    return Response.json({ ok: true, destination: result.canWatch ? "/" : "/account" }, { headers: { "set-cookie": viewerCookie(result.token), "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
