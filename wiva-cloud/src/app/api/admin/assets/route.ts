import { revalidateTag } from "next/cache";
import { requireAdminRequest } from "@/lib/auth";
import { audit, createAsset, listAssets, listProviders } from "@/lib/db";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";
import type { AssetKind } from "@/lib/types";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const body = await jsonBody<Record<string, unknown>>(request);
    const providerId = cleanText(body.providerId, 80);
    const providerAssetRef = cleanText(body.providerAssetRef, 300);
    const kind = cleanText(body.kind, 20) as AssetKind;
    const title = cleanText(body.title, 180);
    if (!providerId || !providerAssetRef || !title || !new Set(["live", "movie", "series"]).has(kind)) throw new HttpError(400, "بيانات المحتوى غير مكتملة");
    const provider = (await listProviders()).find((item) => item.id === providerId);
    if (!provider || !provider.redistributionAttested) throw new HttpError(400, "المزوّد غير صالح أو بلا تأكيد حقوق");
    const id = await createAsset({ providerId, providerAssetRef, kind, title, description: cleanText(body.description, 1200), category: cleanText(body.category, 120), quality: cleanText(body.quality, 30) || "HD", language: cleanText(body.language, 60) });
    await audit("asset.create", "asset", id, { title, kind, providerId });
    revalidateTag("wiva-viewer-catalog", { expire: 0 });
    return Response.json({ ok: true, assets: await listAssets(undefined, true) }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
