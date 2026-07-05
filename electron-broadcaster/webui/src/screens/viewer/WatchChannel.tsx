import { AppLink, useAppPath } from "@/components/AppLink";

export function WatchChannel() {
  const id = useAppPath().split("/").filter(Boolean).at(-1) || "";
  // IPTV/broadcast channels are proxied by the Agent as HLS playlists.
  const src = `/iptv/${id}/index.m3u8`;

  return (
    <div>
      <AppLink href="/live" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        ← البث المباشر
      </AppLink>
      <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
        <video
          controls
          autoPlay
          playsInline
          style={{ width: "100%", aspectRatio: "16/9", background: "#000", display: "block" }}
          src={src}
        />
      </div>
      <div className="row-between">
        <h1 className="page-title">القناة #{id}</h1>
        <span className="badge badge-dot badge-live">بث مباشر</span>
      </div>
      <p className="page-subtitle">
        إذا لم يبدأ التشغيل تلقائيًا، فقد يكون المتصفح لا يدعم البث المباشر مباشرةً؛ جرّب متصفحًا آخر أو تطبيق التلفاز.
      </p>
    </div>
  );
}
