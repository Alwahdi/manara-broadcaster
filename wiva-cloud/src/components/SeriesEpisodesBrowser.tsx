"use client";

import { Layers3 } from "lucide-react";
import { useMemo, useState } from "react";
import { MediaCard } from "@/components/MediaCard";
import type { CatalogAsset } from "@/lib/types";

const PAGE_SIZE = 24;

export function SeriesEpisodesBrowser({ episodes }: { episodes: CatalogAsset[] }) {
  const seasons = useMemo(
    () => [...new Set(episodes.map((episode) => episode.seasonNumber ?? 0))].sort((a, b) => a - b),
    [episodes],
  );
  const [season, setSeason] = useState(seasons[0] ?? 0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const selected = useMemo(
    () => episodes.filter((episode) => (episode.seasonNumber ?? 0) === season),
    [episodes, season],
  );
  const rendered = selected.slice(0, limit);

  if (!episodes.length) return <div className="empty-state"><span><Layers3 /></span><h3>لا توجد حلقات الآن</h3><p>ستظهر الحلقات هنا فور توفرها للمشاهدة.</p></div>;

  return <section className="series-episodes-browser" aria-labelledby="episodes-heading">
    <div className="series-season-bar">
      <div className="season-tabs" role="tablist" aria-label="مواسم المسلسل">
        {seasons.map((value) => <button key={value} type="button" role="tab" aria-selected={season === value} className={season === value ? "active" : ""} onClick={() => { setSeason(value); setLimit(PAGE_SIZE); }}>
          {value ? `الموسم ${value.toLocaleString("ar")}` : "الحلقات"}
        </button>)}
      </div>
      <span>{selected.length.toLocaleString("ar")} حلقة</span>
    </div>
    <div className="section-heading series-episode-heading"><div><h2 id="episodes-heading">{season ? `الموسم ${season.toLocaleString("ar")}` : "الحلقات"}</h2><p>اختر الحلقة وابدأ المشاهدة مباشرة.</p></div></div>
    <div className="media-grid series-episode-grid">{rendered.map((episode, index) => <MediaCard key={episode.id} asset={episode} priority={index < 4} />)}</div>
    {rendered.length < selected.length ? <div className="series-load-more"><span>يظهر {rendered.length.toLocaleString("ar")} من {selected.length.toLocaleString("ar")}</span><button className="button secondary" type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>عرض حلقات أكثر</button></div> : null}
  </section>;
}
