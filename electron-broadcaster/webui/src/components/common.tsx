import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { AppLink } from "@/components/AppLink";
import { api, type MediaItem, type Channel, type ViewerState } from "@/lib/api";
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
    <div className="media-card-wrap">
      <AppLink
        href="/watch/media/$id"
        params={{ id: String(item.id) }}
        className="media-card card-hover"
      >
        <div className="poster media-poster-premium">
          {item.poster ? (
            <img src={item.poster} alt="" loading="lazy" />
          ) : (
            <div className="poster-fallback" aria-hidden>{initials(title)}</div>
          )}
          <span className="poster-shade" aria-hidden />
          <span className="media-kind">{item.category || item.kind || "فيديو"}</span>
          {!online ? <span className="offline-ribbon">غير متاح حاليًا</span> : null}
          <span className="poster-play" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
            </svg>
          </span>
        </div>
        <div className="tile-title truncate">{title}</div>
        <div className="tile-sub">
          {item.category || item.kind || "فيديو"}
          {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ""}
        </div>
      </AppLink>
      <FavoriteButton mediaId={item.id} />
    </div>
  );
}

export function FavoriteButton({ mediaId, compact = true }: { mediaId: string | number; compact?: boolean }) {
  const queryClient = useQueryClient();
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState, staleTime: 30_000 });
  const active = (viewer.data?.favoriteIds || []).includes(String(mediaId));
  const mutation = useMutation({
    mutationFn: () => api.updateViewerList({ list: "favorites", mediaId, active: !active }),
    onSuccess: (next) => queryClient.setQueryData<ViewerState>(["viewer-state"], next),
  });
  return (
    <button
      type="button"
      className={`favorite-button ${compact ? "favorite-button-compact" : ""} ${active ? "active" : ""}`}
      aria-pressed={active}
      aria-label={active ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
      title={active ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} aria-hidden>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact ? <span>{active ? "في المفضلة" : "أضف إلى المفضلة"}</span> : null}
    </button>
  );
}

export function ShareButton({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const payload = { title: document.title, text: "شاهد هذا المحتوى", url: window.location.href };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(payload.url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={share} aria-label="مشاركة">
      <Share2 size={18} />
      {!compact ? <span>{copied ? "تم نسخ الرابط" : "مشاركة"}</span> : null}
    </button>
  );
}

export function ChannelTile({ channel, href }: { channel: Channel; href?: string }) {
  const enabled = channel.enabled !== false && channel.enabled !== 0;
  const kind = channel.type === "iptv" || channel.kind === "iptv" ? "قناة مباشرة" : "بث مباشر";
  const inner = (
    <div className="channel-card channel-card-compact card-hover">
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
        </div>
      </div>
      <div className="channel-card-body">
        <strong>{channel.name}</strong>
        <span>{channel.group || channel.category || kind}</span>
      </div>
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
