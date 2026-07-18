import { currentViewer } from "@/lib/auth";
import { getAsset } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { createPlaybackUrl } from "@/lib/playback";
import { HttpError, errorResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

function gatewayForRequest(request: Request) {
  const configured = process.env.WIVA_MEDIA_GATEWAY_URL?.trim();
  if (!configured) return undefined;
  try {
    const gateway = new URL(configured);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    let publicHostname = requestUrl.hostname;
    try { if (forwardedHost) publicHostname = new URL(`http://${forwardedHost}`).hostname; } catch {}
    if (["127.0.0.1", "localhost", "::1"].includes(gateway.hostname) && !["127.0.0.1", "localhost", "::1", "0.0.0.0"].includes(publicHostname)) gateway.hostname = publicHostname;
    return gateway.toString();
  } catch { return undefined; }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const asset = await getAsset(id);
    if (!asset) throw new HttpError(404, "المحتوى غير موجود");
    if (!asset.isActive) throw new HttpError(403, "المحتوى غير مفعّل");
    const viewer = await currentViewer();
    if (!viewer && !(isDemoMode() && asset.demoPlaybackUrl)) throw new HttpError(401, "سجّل الدخول لبدء المشاهدة");
    const grant = createPlaybackUrl(asset, viewer?.id || "demo-viewer", gatewayForRequest(request));
    return Response.json({ ok: true, ...grant, live: asset.kind === "live" }, { headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
  } catch (error) { return errorResponse(error); }
}
