import { useQuery } from "@tanstack/react-query";
import { AppLink } from "@/components/AppLink";
import { api } from "@/lib/api";
import { QueryBoundary, EmptyState } from "@/components/States";
import { ContentSection } from "@/components/common";
import { getChannelQualityLabel, getViewerChannels } from "./viewer-utils";

export function LiveGuide() {
  const state = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState });
  return (
    <div className="live-guide-page">
      <section className="live-feature-card">
        <div className="live-guide-timeline-bg" aria-hidden />
        <div>
          <span className="badge badge-dot badge-live">مباشر</span>
          <h1>دليل القنوات</h1>
          <p>اختر قناة وشاهد البث المتاح الآن من داخل الشبكة.</p>
        </div>
        <div className="live-feature-art" aria-hidden>
          <span>بث</span>
        </div>
      </section>
      <QueryBoundary
        query={state}
        isEmpty={(d) => {
          return getViewerChannels(d).length === 0;
        }}
        empty={<EmptyState icon="W" title="لا توجد قنوات متاحة حاليًا" text="ستظهر القنوات هنا عند توفر بث مباشر على الشبكة." />}
      >
        {(d) => {
          const channels = getViewerChannels(d);
          return (
            <ContentSection title="القنوات المتاحة" subtitle={`${channels.length} قناة في الدليل`}>
              <div className="guide-card-grid">
                {channels.map((ch) => (
                  <AppLink key={String(ch.id)} href="/watch/channel/$id" params={{ id: String(ch.id) }} className="guide-card">
                    <span className="guide-now-pill">الآن</span>
                    <span className="guide-card-logo">
                      {ch.logo ? <img src={ch.logo} alt="" /> : <span>{String(ch.name || "W").slice(0, 1)}</span>}
                    </span>
                    <span className="guide-card-info">
                      <strong>{ch.name}</strong>
                      <small>{ch.group || ch.category || "قناة مباشرة"}</small>
                    </span>
                    <span className="quality-badge">{getChannelQualityLabel(ch)}</span>
                    <span className={`badge badge-dot ${ch.enabled === false ? "badge-off" : "badge-live"}`}>
                      {ch.enabled === false ? "غير متاح" : "مباشر"}
                    </span>
                  </AppLink>
                ))}
              </div>
            </ContentSection>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
