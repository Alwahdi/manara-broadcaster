import { currentViewerAccount } from "@/lib/auth";
import { auditEvent, createPaymentRequest, listPaymentRequests } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); enforceRateLimit(request, "payment-request", 6, 60 * 60 * 1000);
    const viewer = await currentViewerAccount();
    if (!viewer) throw new HttpError(401, "سجّل الدخول لإرسال طلب التجديد");
    const body = await jsonBody<Record<string, unknown>>(request, 12_000);
    const transferReference = cleanText(body.transferReference, 120);
    const note = cleanText(body.note, 500);
    const requestedDays = Number(body.requestedDays);
    const currency = cleanText(body.currency, 8).toUpperCase() || "USD";
    const rawAmount = cleanText(body.amount, 20); const amount = rawAmount ? Number(rawAmount) : null;
    if (transferReference.length < 4) throw new HttpError(400, "أدخل رقم الحوالة أو المرجع");
    if (![30, 90, 365].includes(requestedDays)) throw new HttpError(400, "اختر مدة تجديد صالحة");
    if (!new Set(["USD", "SAR", "YER"]).has(currency)) throw new HttpError(400, "العملة غير مدعومة");
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)) throw new HttpError(400, "المبلغ غير صالح");
    const id = await createPaymentRequest({ viewerId: viewer.id, amount, currency, transferReference, note, requestedDays });
    if (!id) throw new HttpError(409, "لديك طلب قيد المراجعة بالفعل");
    await auditEvent("viewer", viewer.id, "payment.request", "payment_request", id, { requestedDays, currency, amount });
    return Response.json({ ok: true, requests: await listPaymentRequests(viewer.id) }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
