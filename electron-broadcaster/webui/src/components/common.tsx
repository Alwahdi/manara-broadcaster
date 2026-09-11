import { useId, useState, type ReactNode } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Share2 } from "lucide-react";
import { AppLink } from "@/components/AppLink";
import { api, type MediaItem, type Channel, type ViewerState } from "@/lib/api";
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

export function mediaKindLabel(kind?: string) {
  return ({
    movie: "فيديو",
    episode: "حلقة",
    audio: "صوتيات",
    image: "صورة",
    book: "كتاب",
    document: "مستند",
  } as Record<string, string>)[String(kind || "")] || "محتوى";
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
          <span className="media-kind">{item.category || mediaKindLabel(item.kind)}</span>
          {!online ? <span className="offline-ribbon">غير متاح حاليًا</span> : null}
          <span className="poster-play" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
            </svg>
          </span>
        </div>
        <div className="tile-title truncate">{title}</div>
        <div className="tile-sub">
          {item.category || mediaKindLabel(item.kind)}
          {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ""}
        </div>
      </AppLink>
      <FavoriteButton mediaId={item.id} />
    </div>
  );
}

export function FavoriteButton({ mediaId, compact = true, list = "favorites" }: { mediaId: string | number; compact?: boolean; list?: "favorites" | "watchLater" }) {
  const queryClient = useQueryClient();
  const errorId = useId();
  const saving = useIsMutating({ mutationKey: ["viewer-list"] }) > 0;
  const viewer = useQuery({ queryKey: ["viewer-state"], queryFn: api.viewerState, staleTime: 30_000 });
  const active = (list === "favorites" ? viewer.data?.favoriteIds || [] : viewer.data?.watchLaterIds || []).includes(String(mediaId));
  const collection = list === "favorites" ? "المفضلة" : "المشاهدة لاحقًا";
  const label = `${active ? "إزالة من" : "إضافة إلى"} ${collection}`;
  const mutation = useMutation({
    mutationKey: ["viewer-list"],
    mutationFn: () => api.updateViewerList({ list, mediaId, active: !active }),
    onSuccess: (next) => queryClient.setQueryData<ViewerState>(["viewer-state"], next),
  });
  return (
    <>
    <button
      type="button"
      className={`favorite-button ${compact ? "favorite-button-compact" : ""} ${active ? "active" : ""}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      aria-describedby={mutation.isError ? errorId : undefined}
      disabled={saving || viewer.isPending || viewer.isError}
      onClick={() => mutation.mutate()}
    >
      {list === "watchLater" ? <Clock3 size={20} aria-hidden /> : <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} aria-hidden>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>}
      {!compact ? <span>{label}</span> : null}
    </button>
    {mutation.isError ? <span id={errorId} role="alert" className="collection-action-error">تعذّر تحديث {collection}. لم يُحفظ التغيير؛ أعد المحاولة.</span> : null}
    </>
  );
}

export function ShareButton({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [fallback, setFallback] = useState("");
  const inputId = useId();
  const share = async () => {
    if (pending) return;
    setPending(true);
    setCopied(false);
    setFallback("");
    const payload = { title: document.title, text: "شاهد هذا المحتوى", url: window.location.href };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(payload.url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setFallback(payload.url);
    } finally { setPending(false); }
  };
  return (
    <>
    <button type="button" className="btn btn-ghost btn-sm" onClick={share} aria-label={copied ? "تم نسخ الرابط" : "مشاركة"} disabled={pending}>
      <Share2 size={18} />
      {!compact ? <span>{copied ? "تم نسخ الرابط" : "مشاركة"}</span> : null}
    </button>
    {copied ? <span role="status" className="hint">تم نسخ الرابط</span> : null}
    {fallback ? <div className="field share-fallback">
      <label htmlFor={inputId}>تعذّرت المشاركة التلقائية. انسخ الرابط يدويًا:</label>
      <input id={inputId} className="input mono" dir="ltr" value={fallback} readOnly autoFocus onFocus={(event) => event.target.select()} />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFallback("")}>إغلاق رابط المشاركة</button>
    </div> : null}
    </>
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
      <div className="channel-card-pattern" aria-hidden />
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
      <div className="channel-watch-affordance" aria-hidden>
        <span>شاهد الآن</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
