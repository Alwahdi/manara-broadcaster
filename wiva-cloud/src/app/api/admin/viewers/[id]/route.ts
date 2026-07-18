import { requireAdminRequest } from "@/lib/auth";
import { audit, listViewers, setViewerStatus } from "@/lib/db";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";
import type { ViewerIdentity } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request); const { id } = await params;
    const body = await jsonBody<{ status?: unknown }>(request); const status = cleanText(body.status, 20) as ViewerIdentity["status"];
    if (!new Set(["pending", "active", "blocked", "expired"]).has(status)) throw new HttpError(400, "حالة غير صالحة");
    if (!(await setViewerStatus(id, status))) throw new HttpError(404, "المشاهد غير موجود");
    await audit("viewer.status", "viewer", id, { status });
    return Response.json({ ok: true, viewers: await listViewers() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
