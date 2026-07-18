import { requireAdminRequest } from "@/lib/auth";
import { audit, getAsset, listAssets, listProviders, setAssetActive } from "@/lib/db";
import { assertSameOrigin, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    const body = await jsonBody<{ active?: unknown }>(request);
    if (typeof body.active !== "boolean") throw new HttpError(400, "حالة التفعيل غير صالحة");
    const asset = await getAsset(id);
    if (!asset) throw new HttpError(404, "المحتوى غير موجود");
    if (body.active) {
      const provider = (await listProviders()).find((item) => item.id === asset.providerId);
      if (!provider || provider.status !== "active" || !provider.redistributionAttested) throw new HttpError(409, "فعّل مزوّدًا مرخّصًا أولًا");
    }
    if (!(await setAssetActive(id, body.active))) throw new HttpError(404, "المحتوى غير موجود");
    await audit("asset.status", "asset", id, { active: body.active });
    return Response.json({ ok: true, assets: await listAssets(undefined, true) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
