import { currentViewer, currentViewerSessionHash } from "@/lib/auth";
import { releasePlaybackLease, touchPlaybackLease } from "@/lib/db";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/security";

async function identity() {
  const [viewer, sessionHash] = await Promise.all([currentViewer(), currentViewerSessionHash()]);
  if (!viewer || !sessionHash) throw new HttpError(401, "سجّل الدخول لمتابعة المشاهدة");
  return { viewer, sessionHash };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const [{ id }, { viewer, sessionHash }] = await Promise.all([params, identity()]);
    if (!(await touchPlaybackLease(viewer.id, sessionHash, id))) throw new HttpError(409, "انتهت جلسة المشاهدة. اضغط تشغيل للمتابعة");
    return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const [{ id }, { viewer, sessionHash }] = await Promise.all([params, identity()]);
    await releasePlaybackLease(viewer.id, sessionHash, id);
    return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
