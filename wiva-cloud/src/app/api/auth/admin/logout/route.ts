import { clearAdminCookie, requireAdminRequest } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireAdminRequest(request);
    return Response.json({ ok: true }, { headers: { "set-cookie": clearAdminCookie(), "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
