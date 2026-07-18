import { currentViewerAccount, currentViewerSessionHash } from "@/lib/auth";
import { findViewerByEmail, updateViewerPassword } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request); enforceRateLimit(request, "viewer-password", 5, 60 * 60 * 1000);
    const viewer = await currentViewerAccount(); const tokenHash = await currentViewerSessionHash();
    if (!viewer || !tokenHash) throw new HttpError(401, "سجّل الدخول أولًا");
    const body = await jsonBody<{ currentPassword?: unknown; newPassword?: unknown }>(request);
    const currentPassword = cleanText(body.currentPassword, 512); const newPassword = cleanText(body.newPassword, 512);
    if (newPassword.length < 12) throw new HttpError(400, "كلمة المرور الجديدة يجب أن تكون 12 حرفًا على الأقل");
    if (currentPassword === newPassword) throw new HttpError(400, "اختر كلمة مرور جديدة مختلفة");
    const row = await findViewerByEmail(viewer.email);
    if (!row || !verifyPassword(currentPassword, String(row.password_hash || ""))) throw new HttpError(401, "كلمة المرور الحالية غير صحيحة");
    if (!(await updateViewerPassword(viewer.id, hashPassword(newPassword), tokenHash))) throw new HttpError(404, "الحساب غير موجود");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
