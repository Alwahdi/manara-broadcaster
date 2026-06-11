import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchVisibleNetworks } from "@/lib/networks";

// Leaflet has window-side imports; load only on the client.
export function NetworkMap() {
  const [mounted, setMounted] = useState(false);
  const [Comp, setComp] = useState<null | {
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
    Marker: typeof import("react-leaflet").Marker;
    Popup: typeof import("react-leaflet").Popup;
    L: typeof import("leaflet");
  }>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rl, leafletMod] = await Promise.all([
        import("react-leaflet"),
        import("leaflet"),
      ]);
      await import("leaflet/dist/leaflet.css");
      const L = leafletMod.default ?? leafletMod;
      // Fix default marker icon paths (Vite ESM)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      if (!alive) return;
      setComp({ MapContainer: rl.MapContainer, TileLayer: rl.TileLayer, Marker: rl.Marker, Popup: rl.Popup, L });
      setMounted(true);
    })();
    return () => { alive = false; };
  }, []);

  const { data: networks = [] } = useQuery({
    queryKey: ["public-networks"],
    queryFn: fetchVisibleNetworks,
    staleTime: 60_000,
  });

  if (!mounted || !Comp) {
    return (
      <div className="h-[480px] w-full rounded-3xl glass-panel flex items-center justify-center text-muted-foreground">
        جاري تحميل الخريطة...
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = Comp;

  return (
    <div className="rounded-3xl overflow-hidden border border-white/10 shadow-elegant">
      <MapContainer
        center={[24, 45] as [number, number]}
        zoom={3}
        style={{ height: "480px", width: "100%", background: "#0a0f1f" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {networks.map((n) => (
          <Marker key={n.id} position={[n.latitude, n.longitude] as [number, number]}>
            <Popup>
              <div style={{ direction: "rtl", textAlign: "right", minWidth: 180 }}>
                <strong>{n.name}</strong>
                <div style={{ fontSize: 12, color: "#555" }}>{n.city}{n.city && n.country ? "، " : ""}{n.country}</div>
                {n.website && (
                  <a href={n.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#3b82f6" }}>
                    زيارة الموقع
                  </a>
                )}
                <div style={{ marginTop: 4, fontSize: 11, color: "#888" }}>الخطة: {n.plan}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
