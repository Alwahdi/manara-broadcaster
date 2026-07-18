import { revalidateTag } from "next/cache";
import { requireAdminRequest } from "@/lib/auth";
import { audit, listAssets, listProviders, setAssetsActive } from "@/lib/db";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const body = await jsonBody<{ ids?: unknown; active?: unknown }>(request, 80_000);
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500 || typeof body.active !== "boolean") throw new HttpError(400, "اختر من عنصر واحد إلى 500 عنصر وحالة صحيحة");
    const ids = [...new Set(body.ids.map((id) => cleanText(id, 80)))];
    const assets = (await listAssets(undefined, true)).filter((asset) => ids.includes(asset.id));
    if (assets.length !== ids.length) throw new HttpError(404, "بعض عناصر المحتوى غير موجودة");
    if (body.active) {
      const providers = new Map((await listProviders()).map((provider) => [provider.id, provider]));
      if (assets.some((asset) => !asset.providerId || providers.get(asset.providerId)?.status !== "active" || !providers.get(asset.providerId)?.redistributionAttested)) throw new HttpError(409, "بعض العناصر تتبع مزوّدًا غير مفعّل أو بلا تأكيد حقوق");
    }
    const updated = await setAssetsActive(ids, body.active);
    await audit("asset.bulk-status", "asset", null, { updated, active: body.active });
    revalidateTag("wiva-viewer-catalog", { expire: 0 });
    return Response.json({ ok: true, updated, assets: await listAssets(undefined, true) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
