import { requireAdminRequest } from "@/lib/auth";
import { audit, listPaymentRequests, reviewPaymentRequest } from "@/lib/db";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const { id } = await params; const body = await jsonBody<{ status?: unknown }>(request);
    const status = cleanText(body.status, 20) as "approved" | "rejected";
    if (!new Set(["approved", "rejected"]).has(status)) throw new HttpError(400, "قرار غير صالح");
    if (!(await reviewPaymentRequest(id, status))) throw new HttpError(409, "تمت مراجعة هذا الطلب مسبقًا");
    await audit("payment.review", "payment_request", id, { status });
    return Response.json({ ok: true, requests: await listPaymentRequests() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
