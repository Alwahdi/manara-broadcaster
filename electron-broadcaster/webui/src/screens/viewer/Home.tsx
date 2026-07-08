import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type Channel, type MediaItem } from "@/lib/api";
import { EmptyState, QueryBoundary } from "@/components/States";
import { ChannelTile, ContentSection, MediaTile } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";

export function ViewerHome() {
  const { brand, logo, state } = useBrand();
  const library = useQuery({ queryKey: ["library", "home"], queryFn: () => api.library() });
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  const mode = String(state?.ports?.mode || state?.settings?.experienceLayout || "unified");
  const livePort = Number(state?.ports?.live || state?.settings?.port || 0);
  const libraryPort = Number(state?.ports?.library || state?.ports?.libraryConfigured || state?.settings?.libraryPort || 0);
  const crossPortHref = (path: "/live" | "/library") => {
    if (typeof window === "undefined" || mode !== "separate") return path;
    const targetPort = path === "/live" ? livePort : libraryPort;
    if (!targetPort || Number(window.location.port) === targetPort) return path;
    return `${window.location.protocol}//${window.location.hostname}:${targetPort}${path}`;
  };
  const channels = viewer.data
    ? (((viewer.data.channels as Channel[]) || []).length
      ? (viewer.data.channels as Channel[])
      : [...(((viewer.data.broadcast as Channel[]) || [])), ...(((viewer.data.iptv as Channel[]) || []))])
    : [];
  const media = (library.data?.items || []) as MediaItem[];
  const featuredChannel = channels.find((item) => item.enabled !== false && item.enabled !== 0) || channels[0];
  const featuredMedia = media.find((item) => item.poster) || media[0];
  const heroPoster = String(featuredMedia?.poster || "");
  const favorites = ((viewer.data?.favorites as MediaItem[]) || []).slice(0, 10);
  const continueItems = (((viewer.data?.history as MediaItem[] | undefined) || (viewer.data?.continueWatching as MediaItem[] | undefined) || [])).slice(0, 10);

  return (
    <div className="viewer-home">
      <section className="viewer-hero ott-hero" style={heroPoster ? { "--hero-art": `url(${heroPoster})` } as CSSProperties : undefined}>
        <div className="viewer-hero-content">
          <span className="badge badge-dot badge-live">مباشر الآن</span>
          <h1>
            {featuredChannel?.name || `مرحبًا بك في ${brand}`}
          </h1>
          <p>
            شاهد القنوات المباشرة والمكتبة المحلية بتجربة سريعة ومصممة للجوال والشاشات الكبيرة.
          </p>
          <div className="viewer-hero-actions">
            <AppLink href={featuredChannel ? `/watch/channel/${encodeURIComponent(String(featuredChannel.id))}` : crossPortHref("/live")} className="btn btn-primary">
              تشغيل الآن
            </AppLink>
            <AppLink href={crossPortHref("/live")} className="btn btn-ghost">كل القنوات</AppLink>
            <AppLink href={crossPortHref("/library")} className="btn btn-ghost">المكتبة</AppLink>
          </div>
          <div className="hero-meta-strip" aria-label="ملخص المنصة">
            <div><strong>{channels.length}</strong><span>قناة مباشرة</span></div>
            <div><strong>{media.length}</strong><span>عنصر مكتبة</span></div>
            <div><strong>LAN</strong><span>بث محلي سريع</span></div>
          </div>
        </div>
        <div className="viewer-hero-panel" aria-hidden>
          <img src={logo} alt="" />
          <span>WIVA</span>
          <strong>LIVE</strong>
          <small>{brand}</small>
        </div>
      </section>

      <div className="quick-action-row" aria-label="اختصارات">
        <AppLink href={crossPortHref("/live")} className="quick-action active">البث المباشر</AppLink>
        <AppLink href="/live/guide" className="quick-action">دليل اليوم</AppLink>
        <AppLink href={crossPortHref("/library")} className="quick-action">المجلدات</AppLink>
        <AppLink href="/favorites" className="quick-action">المفضلة</AppLink>
        <AppLink href="/search" className="quick-action">بحث سريع</AppLink>
      </div>

      {continueItems.length ? (
        <ContentSection title="متابعة المشاهدة" subtitle="أكمل من آخر مكان توقفت عنده">
          <div className="media-rail horizontal-rail">
            {continueItems.map((item) => <MediaTile key={item.id} item={item} />)}
          </div>
        </ContentSection>
      ) : null}

      <ContentSection
        eyebrow="LIVE"
        title="يبث الآن"
        subtitle="القنوات المتاحة حاليًا على الشبكة"
        action={<AppLink href="/live" className="btn btn-ghost btn-sm">عرض الكل</AppLink>}
      >
        {viewer.isLoading ? (
          <div className="rail-skeleton"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
        ) : channels.length ? (
          <div className="live-channel-grid horizontal-rail">
            {channels.slice(0, 8).map((channel) => (
              <ChannelTile key={String(channel.id)} channel={channel} href="/watch/channel/$id" />
            ))}
          </div>
        ) : (
          <EmptyState icon="•" title="لا توجد قنوات مباشرة" text="عند تفعيل القنوات من لوحة الإدارة ستظهر هنا مباشرة." />
        )}
      </ContentSection>

      <ContentSection title="أضيف حديثًا" subtitle="آخر محتوى تمت إضافته إلى المكتبة">
      <QueryBoundary
        query={library}
        isEmpty={(d) => !d.items || d.items.length === 0}
        empty={
          <div className="state">
            <div className="state-icon">W</div>
            <div className="state-title">المكتبة فارغة حاليًا</div>
            <p className="state-text">لم تتم إضافة أي وسائط بعد. تواصل مع المشرف لإضافة المحتوى.</p>
          </div>
        }
      >
        {(data) => (
          <div className="media-rail horizontal-rail">
            {data.items.slice(0, 12).map((item) => (
              <MediaTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </QueryBoundary>
      </ContentSection>

      {favorites.length ? (
        <ContentSection title="المفضلة" subtitle="محتوى حفظته للعودة السريعة">
          <div className="media-rail horizontal-rail">
            {favorites.map((item) => <MediaTile key={item.id} item={item} />)}
          </div>
        </ContentSection>
      ) : null}
    </div>
  );
}
