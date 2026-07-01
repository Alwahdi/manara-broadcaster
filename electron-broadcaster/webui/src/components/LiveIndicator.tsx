import { useLiveStatus, type LiveStatus } from "@/hooks/useLiveStatus";

const LABEL: Record<LiveStatus, string> = {
  connecting: "يتصل…",
  online: "مباشر",
  offline: "غير متصل",
};
const CLASS: Record<LiveStatus, string> = {
  connecting: "badge-warn",
  online: "badge-on",
  offline: "badge-off",
};

/** Small always-visible live connection indicator for dashboards and TV screens. */
export function LiveIndicator() {
  const { status } = useLiveStatus();
  return (
    <span className={`badge badge-dot ${CLASS[status]}`} title="حالة الاتصال المباشر">
      {LABEL[status]}
    </span>
  );
}
