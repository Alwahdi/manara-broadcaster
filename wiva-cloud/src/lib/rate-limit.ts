import { HttpError } from "@/lib/security";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(request: Request, scope: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
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
