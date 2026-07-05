import { useEffect, useState } from "react";

/**
 * Shows a subtle banner when the device loses its network connection.
 * WIVA is a LAN-first product, so a clear offline signal helps viewers and
 * operators understand why streams or admin actions may be unavailable.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span aria-hidden>⚠️</span>
      <span>لا يوجد اتصال بالشبكة — بعض المحتوى قد لا يكون متاحًا حتى عودة الاتصال.</span>
    </div>
  );
}
