import { useEffect, useState } from "react";

/** Shows a subtle banner when the device loses its network connection. */
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
      <span aria-hidden>!</span>
      <span>لا يوجد اتصال بالشبكة — بعض المحتوى قد لا يكون متاحًا حتى عودة الاتصال.</span>
    </div>
  );
}
