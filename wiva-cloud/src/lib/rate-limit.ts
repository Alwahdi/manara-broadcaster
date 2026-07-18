import { HttpError } from "@/lib/security";
import { hashToken } from "@/lib/crypto";
import { consumeRateLimit } from "@/lib/db";
import { databaseConfigured } from "@/lib/env";

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function enforceRateLimit(request: Request, scope: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (databaseConfigured()) {
    const count = await consumeRateLimit(scope, hashToken(ip), windowMs);
    if (count > limit) throw new HttpError(429, "محاولات كثيرة. انتظر قليلًا ثم جرّب مجددًا");
    return;
  }
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > limit) throw new HttpError(429, "محاولات كثيرة. انتظر قليلًا ثم جرّب مجددًا");
}
