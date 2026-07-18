export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "wiva-cloud-control-plane",
  }, { headers: { "cache-control": "no-store" } });
}
