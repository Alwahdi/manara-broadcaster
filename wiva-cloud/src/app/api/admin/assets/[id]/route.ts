import { revalidateTag } from "next/cache";
import { requireAdminRequest } from "@/lib/auth";
import { audit, deleteAsset, getAsset, listAssets, listProviders, listSeriesEpisodes, setAssetActive, setAssetSafety } from "@/lib/db";
import { assertSameOrigin, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    const body = await jsonBody<{ active?: unknown; restricted?: unknown; playable?: unknown }>(request);
    if (body.active === undefined && body.restricted === undefined && body.playable === undefined) throw new HttpError(400, "لم يتم تحديد أي تغيير");
    if (body.active !== undefined && typeof body.active !== "boolean") throw new HttpError(400, "حالة التفعيل غير صالحة");
    if (body.restricted !== undefined && typeof body.restricted !== "boolean") throw new HttpError(400, "تصنيف الجمهور غير صالح");
    if (body.playable !== undefined && typeof body.playable !== "boolean") throw new HttpError(400, "حالة التشغيل غير صالحة");
    const asset = await getAsset(id, true);
    if (!asset) throw new HttpError(404, "المحتوى غير موجود");
    if (body.active === true) {
      if (asset.isRestricted || !asset.isPlayable || asset.metadataReview === "needs_review") throw new HttpError(409, "راجع سلامة المحتوى وقابلية تشغيله قبل النشر");
      const provider = (await listProviders()).find((item) => item.id === asset.providerId);
      if (!provider || provider.status !== "active" || !provider.redistributionAttested) throw new HttpError(409, "فعّل مزوّدًا مرخّصًا أولًا");
      if (asset.kind === "series" && !asset.parentAssetId) {
        const episodes = await listSeriesEpisodes(asset.id, true);
        if (!episodes.some((episode) => episode.isActive && !episode.isRestricted && episode.isPlayable)) throw new HttpError(409, "فعّل حلقة صالحة واحدة على الأقل قبل نشر المسلسل");
      }
    }
    if (body.active !== undefined && !(await setAssetActive(id, body.active))) throw new HttpError(404, "المحتوى غير موجود");
    if ((body.restricted !== undefined || body.playable !== undefined) && !(await setAssetSafety(id, {
      restricted: body.restricted as boolean | undefined,
      playable: body.playable as boolean | undefined,
    }))) throw new HttpError(404, "المحتوى غير موجود");
    await audit("asset.update", "asset", id, { active: body.active, restricted: body.restricted, playable: body.playable });
    revalidateTag("wiva-viewer-catalog", { expire: 0 });
    return Response.json({ ok: true, assets: await listAssets(undefined, true) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params;
    const asset = await getAsset(id, true);
    if (!asset) throw new HttpError(404, "المحتوى غير موجود");
    if (!(await deleteAsset(id))) throw new HttpError(404, "المحتوى غير موجود");
    await audit("asset.delete", "asset", id, {
      title: asset.title,
      kind: asset.kind,
      providerId: asset.providerId,
      includedEpisodes: asset.kind === "series" && !asset.parentAssetId,
    });
    revalidateTag("wiva-viewer-catalog", { expire: 0 });
    return Response.json({ ok: true, assets: await listAssets(undefined, true) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
