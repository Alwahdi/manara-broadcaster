import { createFileRoute } from "@tanstack/react-router";
import { PRODUCT } from "@/lib/product";

const ALLOWED = new Set([
  PRODUCT.downloadFile,
  "WIVA-2.6.3-x64.zip",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  "Access-Control-Max-Age": "86400",
};

function redirectToDownload(file: string) {
  if (!ALLOWED.has(file)) {
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...CORS_HEADERS,
      Location: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/releases/${file}`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const Route = createFileRoute("/api/public/download/$file")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      HEAD: async ({ params }) => redirectToDownload(params.file),
      GET: async ({ params }) => redirectToDownload(params.file),
    },
  },
});
