import { currentViewerAccount } from "@/lib/auth";
import { deleteViewerSessionById } from "@/lib/db";
import { assertSameOrigin, errorResponse, HttpError } from "@/lib/security";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const viewer = await currentViewerAccount(); if (!viewer) throw new HttpError(401, "سجّل الدخول أولًا");
    const { id } = await params; if (!(await deleteViewerSessionById(viewer.id, id))) throw new HttpError(404, "الجهاز غير موجود");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
