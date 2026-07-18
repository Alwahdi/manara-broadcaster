import { currentViewer, previewAccess } from "@/lib/auth";
import { hashToken } from "@/lib/crypto";
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
    let viewerId = viewer?.id || "";
    let accessExpiresAt = viewer?.expiresAt ? new Date(viewer.expiresAt).getTime() : Date.now() + 2 * 60 * 60 * 1000;
    let previewCookie: string | null = null;
    let preview = false;
    if (!viewer) {
      const access = await previewAccess();
      if (access.payload.exp <= Date.now()) {
        return Response.json({ ok: false, error: "انتهت المعاينة المجانية", action: "signup" }, { status: 402, headers: { "cache-control": "private, no-store" } });
      }
      viewerId = `preview-${hashToken(access.payload.id).slice(0, 24)}`;
      accessExpiresAt = access.payload.exp;
      previewCookie = access.cookie;
      preview = true;
    }
    const grant = createPlaybackUrl(asset, viewerId || (isDemoMode() ? "demo-viewer" : "preview"), gatewayForRequest(request), accessExpiresAt);
    const headers: Record<string, string> = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
    if (previewCookie) headers["set-cookie"] = previewCookie;
    return Response.json({ ok: true, ...grant, live: asset.kind === "live", preview, previewEndsAt: preview ? accessExpiresAt : null }, { headers });
  } catch (error) { return errorResponse(error); }
}
