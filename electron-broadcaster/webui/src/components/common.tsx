import type { ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import type { MediaItem, Channel } from "@/lib/api";
import { formatDuration } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function StatTile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value mono">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function MediaTile({ item }: { item: MediaItem }) {
  const title = item.title || item.name || "بدون عنوان";
  const online = item.online !== false;
  return (
    <AppLink
      href="/watch/media/$id"
      params={{ id: String(item.id) }}
      className="card-hover"
      style={{ display: "block" }}
    >
      <div className="poster">
        {item.poster ? (
          <img src={item.poster} alt="" loading="lazy" />
        ) : (
          <div className="poster-fallback" aria-hidden>🎬</div>
        )}
        {!online ? <span className="offline-ribbon">غير متصل</span> : null}
      </div>
      <div className="tile-title truncate">{title}</div>
      <div className="tile-sub">
        {item.category || item.kind || "فيديو"}
        {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ""}
      </div>
    </AppLink>
  );
}

export function ChannelTile({ channel, href }: { channel: Channel; href?: string }) {
  const enabled = channel.enabled !== false && channel.enabled !== 0;
  const kind = channel.type === "iptv" || channel.kind === "iptv" ? "IPTV" : "بث مباشر";
  const inner = (
    <div className="channel-card card-hover">
      <div className="channel-card-glow" aria-hidden />
      <div className="channel-card-head">
        <div className="channel-logo-wrap">
          {channel.logo ? (
            <img src={channel.logo} alt="" />
          ) : (
            <span aria-hidden>📺</span>
          )}
        </div>
        <span className={`badge badge-dot ${enabled ? "badge-on" : "badge-off"}`}>
          {enabled ? "مفعّلة" : "متوقفة"}
        </span>
      </div>
      <div className="channel-card-body">
        <strong>{channel.name}</strong>
        <span>{channel.group || channel.category || kind}</span>
      </div>
      {channel.qualities?.length ? (
        <div className="channel-quality-row">
          {channel.qualities.slice(0, 3).map((q) => (
            <span key={String(q.id)}>{q.label || q.name || String(q.id)}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
  if (href) {
    return (
      <AppLink href={href} params={{ id: String(channel.id) }}>
        {inner}
      </AppLink>
    );
  }
  return inner;
}
