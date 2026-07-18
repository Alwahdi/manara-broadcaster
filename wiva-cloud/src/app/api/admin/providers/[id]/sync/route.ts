import { requireAdminRequest } from "@/lib/auth";
import { syncProviderSeriesNow } from "@/lib/provider-sync";
import { assertSameOrigin, errorResponse } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    return Response.json({ ok: true, ...(await syncProviderSeriesNow(id)) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
