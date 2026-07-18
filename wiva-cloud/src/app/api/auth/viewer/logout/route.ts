import { clearViewerCookie, logoutViewer } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await logoutViewer(request);
    const headers = { "set-cookie": clearViewerCookie(), "cache-control": "no-store" };
    if (request.headers.get("accept")?.includes("text/html")) {
      return new Response(null, { status: 303, headers: { ...headers, location: "/login" } });
    }
    return Response.json({ ok: true }, { headers });
  } catch (error) { return errorResponse(error); }
}
