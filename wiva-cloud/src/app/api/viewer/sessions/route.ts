import { currentViewerAccount, currentViewerSessionHash } from "@/lib/auth";
import { deleteOtherViewerSessions } from "@/lib/db";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/security";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request); const viewer = await currentViewerAccount(); const tokenHash = await currentViewerSessionHash();
    if (!viewer || !tokenHash) throw new HttpError(401, "سجّل الدخول أولًا");
    const removed = await deleteOtherViewerSessions(viewer.id, tokenHash);
    return Response.json({ ok: true, removed }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
