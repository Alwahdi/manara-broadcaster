import { createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createViewerSession, deleteViewerSession, findViewerByEmail, viewerBySessionHash } from "@/lib/db";
import { hashToken, safeEqual } from "@/lib/crypto";
import { databaseConfigured } from "@/lib/env";
import { passwordHashIsConfigured, verifyPassword } from "@/lib/password";
import { HttpError } from "@/lib/security";

const ADMIN_COOKIE = "wiva_cloud_admin";
const VIEWER_COOKIE = "wiva_cloud_viewer";

type AdminPayload = { email: string; exp: number; nonce: string };

function sessionSecret() {
  const secret = process.env.WIVA_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("WIVA_SESSION_SECRET must be at least 32 characters");
  return secret;
}

function encodeAdminSession(payload: AdminPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeAdminSession(value?: string): AdminPayload | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminPayload;
    return payload.exp > Date.now() && payload.email ? payload : null;
  } catch {
    return null;
  }
}

export function authenticateAdmin(email: string, password: string) {
  const configuredEmail = process.env.WIVA_ADMIN_EMAIL?.trim().toLowerCase();
  const configuredHash = process.env.WIVA_ADMIN_PASSWORD_HASH?.trim() || "";
  if (!configuredEmail || !passwordHashIsConfigured()) throw new HttpError(503, "حساب الإدارة غير مهيأ");
  if (email.trim().toLowerCase() !== configuredEmail || !verifyPassword(password, configuredHash)) {
    throw new HttpError(401, "بيانات الدخول غير صحيحة");
  }
  return encodeAdminSession({ email: configuredEmail, exp: Date.now() + 8 * 60 * 60 * 1000, nonce: randomBytes(12).toString("hex") });
}

export function adminCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=28800`;
}

export function clearAdminCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=0`;
}

export async function currentAdmin() {
  const store = await cookies();
  return decodeAdminSession(store.get(ADMIN_COOKIE)?.value);
}

export async function requireAdminPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export function requireAdminRequest(request: Request) {
  const raw = request.headers.get("cookie") || "";
  const value = raw.split(/;\s*/).find((item) => item.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  const admin = decodeAdminSession(value);
  if (!admin) throw new HttpError(401, "يلزم تسجيل دخول الإدارة");
  return admin;
}

export async function authenticateViewer(email: string, password: string) {
  if (!databaseConfigured()) throw new HttpError(503, "قاعدة بيانات المشاهدين غير مهيأة");
  const row = await findViewerByEmail(email);
  if (!row || !verifyPassword(password, String(row.password_hash || ""))) throw new HttpError(401, "بيانات الدخول غير صحيحة");
  if (row.status !== "active") throw new HttpError(403, "الحساب غير متاح حاليًا");
  if (row.expires_at && new Date(String(row.expires_at)).getTime() < Date.now()) throw new HttpError(403, "انتهت صلاحية الحساب");
  const token = randomBytes(32).toString("base64url");
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  await createViewerSession(String(row.id), hashToken(token), requestHeaders.get("user-agent") || "", hashToken(ip));
  return token;
}

export function viewerCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VIEWER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=2592000`;
}

export function clearViewerCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${VIEWER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

export async function currentViewer() {
  const store = await cookies();
  const token = store.get(VIEWER_COOKIE)?.value;
  return token ? viewerBySessionHash(hashToken(token)) : null;
}

export async function logoutViewer(request: Request) {
  const raw = request.headers.get("cookie") || "";
  const token = raw.split(/;\s*/).find((item) => item.startsWith(`${VIEWER_COOKIE}=`))?.slice(VIEWER_COOKIE.length + 1);
  if (token) await deleteViewerSession(hashToken(token));
}
