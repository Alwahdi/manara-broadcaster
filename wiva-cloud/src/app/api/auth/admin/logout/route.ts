import { clearAdminCookie, requireAdminRequest } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireAdminRequest(request);
    return new Response(null, {
      status: 303,
      headers: {
        location: new URL("/admin/login", request.url).toString(),
        "set-cookie": clearAdminCookie(),
        "cache-control": "no-store",
      },
    });
  } catch (error) { return errorResponse(error); }
}
