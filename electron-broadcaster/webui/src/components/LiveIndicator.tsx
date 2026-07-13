import { useLiveStatus, type LiveStatus } from "@/hooks/useLiveStatus";

const LABEL: Record<LiveStatus, string> = {
  connecting: "جارٍ الاتصال…",
  online: "متصل",
  offline: "غير متصل",
};
const CLASS: Record<LiveStatus, string> = {
  connecting: "badge-warn",
  online: "badge-on",
  offline: "badge-off",
};

/** Small always-visible live status indicator. */
export function LiveIndicator() {
  const { status } = useLiveStatus();
  return (
    <span className={`badge badge-dot ${CLASS[status]}`} title="اتصال التحديث المباشر">
      {LABEL[status]}
    </span>
  );
}
