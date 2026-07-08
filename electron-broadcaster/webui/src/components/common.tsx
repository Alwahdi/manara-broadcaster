import type { ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import type { MediaItem, Channel } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { getChannelQualityLabel } from "@/screens/viewer/viewer-utils";

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

export function ContentSection({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`content-section ${className}`} aria-label={title}>
      <div className="section-head">
        <div>
          {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
          <h2 className="section-title">{title}</h2>
          {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="section-action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function CategoryChips({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="category-chips" role="tablist" aria-label="تصفية المحتوى">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={`chip ${value === item.value ? "active" : ""}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function initials(value?: string) {
  const parts = String(value || "WIVA").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "W";
}

export function MediaTile({ item }: { item: MediaItem }) {
  const title = item.title || item.name || "بدون عنوان";
  const online = item.online !== false;
  return (
    <AppLink
      href="/watch/media/$id"
      params={{ id: String(item.id) }}
      className="media-card card-hover"
    >
      <div className="poster">
        {item.poster ? (
          <img src={item.poster} alt="" loading="lazy" />
        ) : (
          <div className="poster-fallback" aria-hidden>{initials(title)}</div>
        )}
        <span className="poster-shade" aria-hidden />
        <span className="media-kind">{item.category || item.kind || "فيديو"}</span>
        {!online ? <span className="offline-ribbon">غير متاح حاليًا</span> : null}
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
  const kind = channel.type === "iptv" || channel.kind === "iptv" ? "قناة مباشرة" : "بث مباشر";
  const qualities = Array.isArray(channel.qualities) ? channel.qualities : [];
  const qualityLabel = getChannelQualityLabel(channel);
  const inner = (
    <div className="channel-card card-hover">
      <div className="channel-card-glow" aria-hidden />
      <div className="channel-card-head">
        <div className="channel-logo-wrap">
          {channel.logo ? (
            <img src={channel.logo} alt="" />
          ) : (
            <span aria-hidden>{initials(channel.name)}</span>
          )}
        </div>
        <div className="channel-status-stack">
          <span className={`badge badge-dot ${enabled ? "badge-live" : "badge-off"}`}>
            {enabled ? "مباشر" : "متوقف"}
          </span>
          <span className="quality-badge">{qualityLabel}</span>
        </div>
      </div>
      <div className="channel-card-body">
        <strong>{channel.name}</strong>
        <span>{channel.group || channel.category || kind}</span>
        {channel.description ? <small>{channel.description}</small> : null}
      </div>
      {qualities.length ? (
        <div className="channel-quality-row">
          {qualities.slice(0, 3).map((q) => (
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
