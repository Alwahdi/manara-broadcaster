import { currentViewer } from "@/lib/auth";
import { getAsset, getViewerActivity, saveViewerProgress, setViewerFavorite } from "@/lib/db";
import { assertSameOrigin, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await currentViewer(); if (!viewer) throw new HttpError(401, "سجّل الدخول لحفظ نشاط المشاهدة");
    const { id } = await params; if (!(await getAsset(id))) throw new HttpError(404, "المحتوى غير موجود");
    return Response.json({ ok: true, activity: await getViewerActivity(viewer.id, id) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const viewer = await currentViewer(); if (!viewer) throw new HttpError(401, "سجّل الدخول لحفظ نشاط المشاهدة");
    const { id } = await params; const asset = await getAsset(id); if (!asset) throw new HttpError(404, "المحتوى غير موجود");
    const body = await jsonBody<{ favorite?: unknown; positionSeconds?: unknown; durationSeconds?: unknown; completed?: unknown }>(request);
    if (body.favorite !== undefined) {
      if (typeof body.favorite !== "boolean") throw new HttpError(400, "قيمة المفضلة غير صالحة");
      await setViewerFavorite(viewer.id, id, body.favorite);
    }
    if (body.positionSeconds !== undefined && asset.kind !== "live") {
      const position = Math.max(0, Math.min(24 * 60 * 60, Math.floor(Number(body.positionSeconds) || 0)));
      const duration = Math.max(0, Math.min(24 * 60 * 60, Math.floor(Number(body.durationSeconds) || 0)));
      await saveViewerProgress(viewer.id, id, position, duration, body.completed === true || (duration > 0 && position >= duration * .95));
    }
    return Response.json({ ok: true, activity: await getViewerActivity(viewer.id, id) }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
