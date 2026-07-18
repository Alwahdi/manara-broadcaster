import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function credentialsKey() {
  const value = process.env.WIVA_CREDENTIALS_KEY?.trim();
  if (!value) throw new Error("WIVA_CREDENTIALS_KEY is not configured");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("WIVA_CREDENTIALS_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function encryptCredentials(value: Record<string, string>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialsKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptCredentials(value: string) {
  const raw = Buffer.from(value, "base64");
  if (raw.length < 29) throw new Error("Invalid encrypted credentials");
  const decipher = createDecipheriv("aes-256-gcm", credentialsKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  return JSON.parse(json) as Record<string, string>;
}

export function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashToken(value: string) {
  return createHmac("sha256", process.env.WIVA_SESSION_SECRET || "missing-session-secret")
    .update(value)
    .digest("hex");
}
