import { requireAdminRequest } from "@/lib/auth";
import { audit, createViewer, listViewers } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const body = await jsonBody<Record<string, unknown>>(request);
    const name = cleanText(body.name, 120); const email = cleanText(body.email, 254).toLowerCase(); const password = cleanText(body.password, 512);
    const maxConcurrentStreams = Math.max(1, Math.min(10, Number(body.maxConcurrentStreams) || 1));
    const expiresRaw = cleanText(body.expiresAt, 20); const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59.999Z`).toISOString() : null;
    if (!name || !email.includes("@") || password.length < 12) throw new HttpError(400, "الاسم والبريد وكلمة مرور من 12 حرفًا مطلوبة");
    const id = await createViewer({ name, email, passwordHash: hashPassword(password), maxConcurrentStreams, expiresAt });
    await audit("viewer.create", "viewer", id, { name, email, maxConcurrentStreams, expiresAt });
    return Response.json({ ok: true, viewers: await listViewers() }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
