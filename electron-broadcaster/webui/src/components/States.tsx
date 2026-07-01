import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

export function LoadingState({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" />
      <div className="state-title">{label}</div>
    </div>
  );
}

export function EmptyState({
  icon = "🗂️",
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
    <div className="state">
      <div className="state-icon" aria-hidden>
        {icon}
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
    <div className="state" role="alert">
      <div className="state-icon" aria-hidden>
        ⚠️
      </div>
      <div className="state-title">تعذّر تحميل البيانات</div>
      <p className="state-text">{message}</p>
      {onRetry ? (
        <button className="btn btn-primary" onClick={onRetry}>
          إعادة المحاولة
        </button>
      ) : null}
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
