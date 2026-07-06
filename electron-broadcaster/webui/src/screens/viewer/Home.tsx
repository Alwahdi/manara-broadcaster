import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader, MediaTile } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function ViewerHome() {
  const { brand, state } = useBrand();
  const library = useQuery({ queryKey: ["library", "home"], queryFn: () => api.library() });
  const mode = String(state?.ports?.mode || state?.settings?.experienceLayout || "unified");
  const livePort = Number(state?.ports?.live || state?.settings?.port || 0);
  const libraryPort = Number(state?.ports?.library || state?.ports?.libraryConfigured || state?.settings?.libraryPort || 0);
  const crossPortHref = (path: "/live" | "/library") => {
    if (typeof window === "undefined" || mode !== "separate") return path;
    const targetPort = path === "/live" ? livePort : libraryPort;
    if (!targetPort || Number(window.location.port) === targetPort) return path;
    return `${window.location.protocol}//${window.location.hostname}:${targetPort}${path}`;
  };

  return (
    <div>
      <section className="viewer-hero">
        <div className="viewer-hero-content">
          <span className="badge badge-dot badge-live">مباشر الآن</span>
          <h1>
            مرحبًا بك في {brand}
          </h1>
          <p>
            شاهد البث المباشر والقنوات والمكتبة الكاملة عبر الشبكة المحلية — دون الحاجة إلى إنترنت.
          </p>
          <div className="viewer-hero-actions">
            <AppLink href={crossPortHref("/live")} className="btn btn-primary">مشاهدة البث المباشر</AppLink>
            <AppLink href={crossPortHref("/library")} className="btn btn-ghost">تصفّح المكتبة</AppLink>
          </div>
        </div>
        <div className="viewer-hero-panel" aria-hidden>
          <span>Live</span>
          <strong>HD</strong>
          <small>LAN Streaming</small>
        </div>
      </section>

      <PageHeader title="أحدث الإضافات" subtitle="أحدث ما تمت إضافته إلى المكتبة" />
      <QueryBoundary
        query={library}
        isEmpty={(d) => !d.items || d.items.length === 0}
        empty={
          <div className="state">
            <div className="state-icon">🎬</div>
            <div className="state-title">المكتبة فارغة حاليًا</div>
            <p className="state-text">لم تتم إضافة أي وسائط بعد. تواصل مع المشرف لإضافة المحتوى.</p>
          </div>
        }
      >
        {(data) => (
          <div className="media-rail">
            {data.items.slice(0, 12).map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
