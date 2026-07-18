import { revalidateTag } from "next/cache";
import { requireAdminRequest } from "@/lib/auth";
import { audit, listProviders, setProviderStatus } from "@/lib/db";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";
import type { ProviderSummary } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    const body = await jsonBody<{ status?: unknown }>(request);
    const status = cleanText(body.status, 20) as ProviderSummary["status"];
    if (!new Set(["disabled", "active", "degraded", "blocked"]).has(status)) throw new HttpError(400, "حالة غير صالحة");
    if (!(await setProviderStatus(id, status))) throw new HttpError(404, "المزوّد غير موجود");
    await audit("provider.status", "provider", id, { status });
    revalidateTag("wiva-viewer-catalog", { expire: 0 });
    return Response.json({ ok: true, providers: await listProviders() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
