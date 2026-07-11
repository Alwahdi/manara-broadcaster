import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api, type MediaItem } from "@/lib/api";
import { EmptyState, QueryBoundary, ViewerSkeleton } from "@/components/States";
import { ChannelTile, ContentSection, MediaTile } from "@/components/common";
import { useBrand } from "@/hooks/useBrand";
import { folderResults, getViewerChannels } from "./viewer-utils";

export function ViewerHome() {
  const { brand, logo, state } = useBrand();
  const library = useQuery({ queryKey: ["library", "home"], queryFn: () => api.library(), staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false });
  const folders = useQuery({ queryKey: ["library-browse", "home-root"], queryFn: () => api.libraryBrowse(), staleTime: 30 * 60_000, gcTime: 60 * 60_000, refetchOnWindowFocus: false });
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState, staleTime: 30_000, refetchOnWindowFocus: false });
  const mode = String(state?.ports?.mode || state?.settings?.experienceLayout || "unified");
  const livePort = Number(state?.ports?.live || state?.settings?.port || 0);
  const libraryPort = Number(state?.ports?.library || state?.ports?.libraryConfigured || state?.settings?.libraryPort || 0);
  const crossPortHref = (path: "/live" | "/library") => {
    if (typeof window === "undefined" || mode !== "separate") return path;
    const targetPort = path === "/live" ? livePort : libraryPort;
    if (!targetPort || Number(window.location.port) === targetPort) return path;
    return `${window.location.protocol}//${window.location.hostname}:${targetPort}${path}`;
  };
  const channels = getViewerChannels(viewer.data);
  const media = (library.data?.items || []) as MediaItem[];
  const featuredChannel = channels.find((item) => item.enabled !== false && item.enabled !== 0) || channels[0];
  const featuredMedia = media.find((item) => item.poster) || media[0];
  const heroPoster = String(featuredMedia?.poster || "");
  const favorites = ((viewer.data?.favorites as MediaItem[]) || []).slice(0, 10);
  const continueItems = (viewer.data?.history || []).map((row) => row.media).filter((item): item is MediaItem => !!item).slice(0, 10);
  const folderPreview = folderResults(folders.data?.entries).filter((entry) => entry.type === "folder").slice(0, 8);
  const showFavoritesShortcut = favorites.length > 0;

  return (
    <div className="viewer-home">
      <section className="viewer-hero ott-hero" style={heroPoster ? { "--hero-art": `url(${heroPoster})` } as CSSProperties : undefined}>
        <div className="hero-ambient" aria-hidden />
        <div className="viewer-hero-content">
          <span className="badge badge-dot badge-live">تجربة مشاهدة مباشرة</span>
          <h1>
            {featuredChannel?.name || `مرحبًا بك في ${brand}`}
          </h1>
          <p>
            شاهد القنوات المباشرة واستكشف الاستراحة من مكان واحد بتجربة سريعة ومصممة للجوال والشاشات الكبيرة.
          </p>
          <div className="viewer-hero-actions">
            <AppLink href={featuredChannel ? `/watch/channel/${encodeURIComponent(String(featuredChannel.id))}` : crossPortHref("/live")} className="btn btn-primary">
              تشغيل الآن
            </AppLink>
            <AppLink href={crossPortHref("/live")} className="btn btn-ghost">كل القنوات</AppLink>
            <AppLink href={crossPortHref("/library")} className="btn btn-ghost">الاستراحة</AppLink>
          </div>
          <div className="hero-meta-strip" aria-label="ملخص المنصة">
            <div><strong>{channels.length}</strong><span>قناة مباشرة</span></div>
            <div><strong>{folderPreview.length || media.length}</strong><span>قسم متاح</span></div>
            <div><strong>سريع</strong><span>داخل الشبكة</span></div>
          </div>
        </div>
        <div className="viewer-hero-panel hero-device-preview" aria-hidden>
          <div className="hero-device-screen">
            <img src={logo} alt="" />
            <span>{brand}</span>
            <strong>مباشر</strong>
          </div>
          <div className="hero-mini-rail">
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>

      <div className="quick-action-row" aria-label="اختصارات">
        <AppLink href={crossPortHref("/live")} className="quick-action active">البث المباشر</AppLink>
        <AppLink href="/live/guide" className="quick-action">دليل اليوم</AppLink>
        <AppLink href={crossPortHref("/library")} className="quick-action">الاستراحة</AppLink>
        <AppLink href="/search" className="quick-action">بحث سريع</AppLink>
        {showFavoritesShortcut ? <AppLink href="/favorites" className="quick-action">المفضلة</AppLink> : null}
      </div>

      {continueItems.length ? (
        <ContentSection title="متابعة المشاهدة" subtitle="أكمل من آخر مكان توقفت عنده">
          <div className="media-rail horizontal-rail">
            {continueItems.map((item) => <MediaTile key={item.id} item={item} />)}
          </div>
        </ContentSection>
      ) : null}

      <ContentSection
        eyebrow="مباشر"
        title="يبث الآن"
        subtitle="القنوات المتاحة حاليًا على الشبكة"
        action={<AppLink href="/live" className="btn btn-ghost btn-sm">عرض الكل</AppLink>}
      >
        {viewer.isLoading ? (
          <ViewerSkeleton count={4} />
        ) : channels.length ? (
          <div className="live-channel-grid horizontal-rail">
            {channels.slice(0, 8).map((channel) => (
              <ChannelTile key={String(channel.id)} channel={channel} href="/watch/channel/$id" />
            ))}
          </div>
        ) : (
          <EmptyState icon="W" title="لا توجد قنوات مباشرة" text="ستظهر القنوات هنا عند توفر بث مباشر على الشبكة." />
        )}
      </ContentSection>

      {folderPreview.length ? (
        <ContentSection title="الاستراحة" subtitle="تصفح الأقسام والمجلدات المتاحة">
          <div className="folder-grid home-folder-preview">
            {folderPreview.map((entry) => (
              <AppLink
                key={`${entry.sourceId || "root"}-${entry.path || entry.name}`}
                href={`/library/folders?sourceId=${encodeURIComponent(String(entry.sourceId || ""))}&path=${encodeURIComponent(entry.path || "")}`}
                className="folder-card folder-card-cinematic"
              >
                <div className="folder-card-art">
                  {entry.cover ? <img src={entry.cover} alt="" loading="lazy" /> : <span aria-hidden>قسم</span>}
                </div>
                <div className="folder-card-body">
                  <span className="folder-card-title">{entry.name}</span>
                  <span className="folder-card-sub">{entry.count || 0} عنصر</span>
                </div>
              </AppLink>
            ))}
          </div>
        </ContentSection>
      ) : null}

      <ContentSection title="أضيف حديثًا" subtitle="آخر محتوى متاح في الاستراحة">
      <QueryBoundary
        query={library}
        isEmpty={(d) => !d.items || d.items.length === 0}
        empty={
          <div className="state">
            <div className="state-icon">W</div>
            <div className="state-title">لا يوجد محتوى متاح حاليًا</div>
            <p className="state-text">ستظهر الأقسام هنا عند توفر محتوى جديد على الشبكة.</p>
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
        <ContentSection title="المفضلة" subtitle="اختياراتك للعودة السريعة">
          <div className="media-rail horizontal-rail">
            {favorites.map((item) => <MediaTile key={item.id} item={item} />)}
          </div>
        </ContentSection>
      ) : null}
    </div>
  );
}
