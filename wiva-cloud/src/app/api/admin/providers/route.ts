import { audit, createProvider, listProviders } from "@/lib/db";
import { requireAdminRequest } from "@/lib/auth";
import { encryptCredentials } from "@/lib/crypto";
import { assertSameOrigin, cleanText, errorResponse, HttpError, jsonBody } from "@/lib/security";
import type { ProviderSummary } from "@/lib/types";

const kinds = new Set<ProviderSummary["kind"]>(["licensed_hls", "licensed_xtream", "licensed_vod"]);

export async function GET(request: Request) {
  try { requireAdminRequest(request); return Response.json({ ok: true, providers: await listProviders() }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); requireAdminRequest(request);
    const body = await jsonBody<Record<string, unknown>>(request);
    const name = cleanText(body.name, 120);
    const kind = cleanText(body.kind, 40) as ProviderSummary["kind"];
    const baseUrl = cleanText(body.baseUrl, 500);
    const rightsReference = cleanText(body.rightsReference, 500);
    const priority = Math.max(1, Math.min(9999, Number(body.priority) || 100));
    if (!name || !kinds.has(kind)) throw new HttpError(400, "بيانات المزوّد غير مكتملة");
    let parsed: URL;
    try { parsed = new URL(baseUrl); } catch { throw new HttpError(400, "عنوان الخادم غير صالح"); }
    const insecureHttp = parsed.protocol === "http:" && body.allowInsecureHttp === "true" && process.env.WIVA_ALLOW_INSECURE_PROVIDER_HTTP === "true";
    if (parsed.protocol !== "https:" && !insecureHttp) throw new HttpError(400, "استخدم HTTPS، أو فعّل سماح HTTP المحلي ووافق على التحذير");
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new HttpError(400, "بروتوكول الخادم غير مدعوم");
    if (rightsReference.length < 8 || body.attested !== "true") throw new HttpError(400, "يلزم مرجع مكتوب وتأكيد حق إعادة التوزيع");
    const credentialsCipher = encryptCredentials({ baseUrl: parsed.toString(), username: cleanText(body.username, 200), password: cleanText(body.password, 500), allowInsecureHttp: insecureHttp ? "true" : "false" });
    const id = await createProvider({ name, kind, credentialsCipher, rightsReference, priority });
    await audit("provider.create", "provider", id, { name, kind, priority, rightsReference, insecureHttp });
    return Response.json({ ok: true, providers: await listProviders() }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
