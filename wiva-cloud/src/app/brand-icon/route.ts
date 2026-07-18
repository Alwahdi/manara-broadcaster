import { WIVA_WORDMARK_BASE64 } from "@/lib/brand-assets";

export const dynamic = "force-static";

export function GET() {
  return new Response(Buffer.from(WIVA_WORDMARK_BASE64, "base64"), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
