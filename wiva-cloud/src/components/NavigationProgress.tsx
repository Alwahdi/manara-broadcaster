"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function NavigationProgressIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href || destination.hash) return;
      setPending(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setPending(false), 8_000);
    };
    document.addEventListener("click", start);
    return () => {
      document.removeEventListener("click", start);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return <div className={`navigation-progress ${pending ? "active" : ""}`} role="progressbar" aria-label="جارٍ فتح الصفحة" aria-hidden={!pending}><span /></div>;
}

export function NavigationProgress() {
  return <Suspense fallback={null}><NavigationProgressIndicator /></Suspense>;
}
