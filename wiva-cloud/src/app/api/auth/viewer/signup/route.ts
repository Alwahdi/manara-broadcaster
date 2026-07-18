import { issueViewerSession, viewerCookie } from "@/lib/auth";
import { auditEvent, createViewer } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); enforceRateLimit(request, "viewer-signup", 4, 60 * 60 * 1000);
    const body = await jsonBody<Record<string, unknown>>(request, 10_000);
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = cleanText(body.password, 512);
    if (!name || !email.includes("@") || password.length < 12) throw new HttpError(400, "أدخل الاسم والبريد وكلمة مرور من 12 حرفًا على الأقل");
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    let id: string;
    try {
      id = await createViewer({ name, email, passwordHash: hashPassword(password), maxConcurrentStreams: 1, expiresAt });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") throw new HttpError(409, "يوجد حساب بهذا البريد. سجّل الدخول بدلًا من ذلك");
      throw error;
    }
    const token = await issueViewerSession(id);
    await auditEvent("viewer", id, "viewer.self_signup", "viewer", id, { trialDays: 3 });
    return Response.json({ ok: true, destination: "/" }, { status: 201, headers: { "set-cookie": viewerCookie(token), "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
