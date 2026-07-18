import { appUrl } from "@/lib/env";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(appUrl()).origin;
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const hostOrigin = `${protocol}://${host}`;
  if (origin !== expected && origin !== hostOrigin) throw new HttpError(403, "Cross-site mutation rejected");
}

export async function jsonBody<T>(request: Request, maxBytes = 32_000): Promise<T> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Request is too large");
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function cleanText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "تعذر إكمال الطلب الآن";
  return Response.json({ ok: false, error: message }, { status });
}
