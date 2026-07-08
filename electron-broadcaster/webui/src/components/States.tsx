import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

export function LoadingState({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="state viewer-state-premium" role="status" aria-live="polite">
      <div className="state-orbit" aria-hidden>
        <span />
      </div>
      <div className="state-title">{label}</div>
      <div className="viewer-skeleton-row" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "W",
  title = "لا توجد عناصر بعد",
  text,
  action,
}: {
  icon?: string;
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state viewer-state-premium">
      <div className="state-icon state-icon-premium" aria-hidden>
        <span>{icon}</span>
      </div>
      <div className="state-title">{title}</div>
      {text ? <p className="state-text">{text}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message =
    (error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "") || "حدث خطأ غير متوقع.";
  return (
    <div className="state viewer-state-premium" role="alert">
      <div className="state-icon state-icon-premium state-icon-error" aria-hidden>
        <span>!</span>
      </div>
      <div className="state-title">تعذّر تحميل المحتوى</div>
      <p className="state-text">{message || "تحقق من اتصالك بالشبكة ثم حاول مرة أخرى."}</p>
      {onRetry ? (
        <button className="btn btn-primary" onClick={onRetry}>
          إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}

export function ViewerSkeleton({
  variant = "cards",
  count = 4,
}: {
  variant?: "hero" | "cards" | "folders" | "player" | "search";
  count?: number;
}) {
  if (variant === "hero") {
    return (
      <div className="viewer-hero hero-skeleton" aria-hidden>
        <div className="skeleton-copy">
          <span />
          <span />
          <span />
        </div>
        <div className="skeleton-poster" />
      </div>
    );
  }
  if (variant === "player") {
    return <div className="skeleton-player" aria-hidden />;
  }
  return (
    <div className={`viewer-skeleton-grid viewer-skeleton-${variant}`} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton-card">
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

/**
 * Renders consistent loading / error / empty / data states for any query.
 * Keeps every page compliant with the "clear loading, empty, error state" rule.
 */
export function QueryBoundary<T>({
  query,
  children,
  empty,
  isEmpty,
  loadingLabel,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  loadingLabel?: string;
}) {
  if (query.isLoading) return <LoadingState label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (data === undefined) return <LoadingState label={loadingLabel} />;
  if (isEmpty && isEmpty(data)) return <>{empty ?? <EmptyState />}</>;
  return <>{children(data)}</>;
}
