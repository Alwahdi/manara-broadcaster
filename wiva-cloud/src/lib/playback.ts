import { randomBytes } from "node:crypto";
import { hmac } from "@/lib/crypto";
import { isDemoMode, tenantId } from "@/lib/env";
import type { CatalogAsset } from "@/lib/types";

export function createPlaybackUrl(asset: CatalogAsset, viewerId: string, gatewayOverride?: string, accessExpiresAt = Date.now() + 2 * 60 * 60 * 1000) {
  if (asset.demoPlaybackUrl && isDemoMode() && process.env.WIVA_ALLOW_PUBLIC_DEMO_PLAYBACK === "true") {
    return { url: asset.demoPlaybackUrl, expiresAt: Date.now() + 5 * 60 * 1000, demo: true };
  }

  const gateway = (gatewayOverride || process.env.WIVA_MEDIA_GATEWAY_URL)?.trim().replace(/\/$/, "");
  const secret = process.env.WIVA_PLAYBACK_SIGNING_SECRET?.trim();
  if (!gateway || !secret || secret.length < 32) throw new Error("Media gateway is not configured");

  const tenant = tenantId();
  const exp = Math.floor(Date.now() / 1000) + 90;
  const accessExp = Math.floor(accessExpiresAt / 1000);
  const nonce = randomBytes(12).toString("base64url");
  const signature = hmac(`${tenant}.${asset.id}.${viewerId}.${exp}.${accessExp}.${nonce}`, secret);
  const resource = asset.kind === "live" ? "index.m3u8" : "media";
  const url = new URL(`${gateway}/v1/play/${encodeURIComponent(asset.id)}/${resource}`);
  url.searchParams.set("tenant", tenant);
  url.searchParams.set("viewer", viewerId);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("accessExp", String(accessExp));
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("sig", signature);
  return { url: url.toString(), expiresAt: exp * 1000, accessExpiresAt: accessExp * 1000, demo: false };
}
