import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary } from "@/components/States";
import { PageHeader, MediaTile } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function ViewerHome() {
  const { brand } = useBrand();
  const library = useQuery({ queryKey: ["library", "home"], queryFn: () => api.library() });

  return (
    <div>
      <section className="card card-pad" style={{ marginBottom: 28, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "relative", zIndex: 1 }}>
          <span className="badge badge-dot badge-live">مباشر الآن</span>
          <h1 className="page-title" style={{ fontSize: "clamp(1.8rem,5vw,3rem)", marginTop: 12 }}>
            مرحبًا بك في {brand}
          </h1>
          <p className="page-subtitle" style={{ maxWidth: "52ch" }}>
            شاهد البث المباشر والقنوات والمكتبة الكاملة عبر الشبكة المحلية — دون الحاجة إلى إنترنت.
          </p>
          <div className="row" style={{ marginTop: 20 }}>
            <AppLink href="/live" className="btn btn-primary">مشاهدة البث المباشر</AppLink>
            <AppLink href="/library" className="btn btn-ghost">تصفّح المكتبة</AppLink>
          </div>
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
          <div className="grid grid-auto">
            {data.items.slice(0, 12).map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
