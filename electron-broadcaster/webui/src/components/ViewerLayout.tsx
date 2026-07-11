import type { ReactNode } from "react";
import { AppLink, useAppPath } from "@/components/AppLink";
import { useBrand } from "@/hooks/useBrand";
import { LiveIndicator } from "@/components/LiveIndicator";
import { OfflineBanner } from "@/components/OfflineBanner";

const NAV = [
  { to: "/", label: "الرئيسية", short: "الرئيسية", icon: "home", exact: true },
  { to: "/live", label: "البث المباشر", short: "مباشر", icon: "live" },
  { to: "/library", label: "الاستراحة", short: "الاستراحة", icon: "library" },
  { to: "/search", label: "البحث", short: "بحث", icon: "search" },
  { to: "/account", label: "الحساب والإعدادات", short: "حسابي", icon: "user" },
];

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

function portAwareHref(path: string, state?: ReturnType<typeof useBrand>["state"]) {
  if (typeof window === "undefined") return path;
  const mode = String(state?.ports?.mode || state?.settings?.experienceLayout || "unified");
  if (mode !== "separate") return path;
  const livePort = Number(state?.ports?.live || state?.settings?.port || 0);
  const libraryPort = Number(state?.ports?.library || state?.ports?.libraryConfigured || state?.settings?.libraryPort || 0);
  const targetPort = path.startsWith("/live") ? livePort : path.startsWith("/library") ? libraryPort : 0;
  if (!targetPort || Number(window.location.port) === targetPort) return path;
  return `${window.location.protocol}//${window.location.hostname}:${targetPort}${path}`;
}

function NavIcon({ name }: { name: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") {
    return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-5h5v5" /></svg>;
  }
  if (name === "live") {
    return <svg {...common}><rect x="3" y="5" width="18" height="13" rx="3" /><path d="M10 9.5v4l4-2-4-2Z" fill="currentColor" stroke="none" /><path d="M8 21h8" /></svg>;
  }
  if (name === "library") {
    return <svg {...common}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v15H6.5A2.5 2.5 0 0 0 4 21V6.5Z" /><path d="M8 8h8" /><path d="M8 12h6" /></svg>;
  }
  if (name === "search") {
    return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></svg>;
}

export function ViewerLayout({ children }: { children: ReactNode }) {
  const { brand, logo, state } = useBrand();
  const path = useAppPath();
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">تخطَّ إلى المحتوى</a>
      <OfflineBanner />
      <header className="topbar">
        <AppLink href="/" className="brand">
          <img src={logo} alt="" className="brand-logo" />
          <span>{brand}</span>
        </AppLink>
        <nav className="topnav grow" aria-label="التنقل الرئيسي">
          {NAV.map((item) => (
            <AppLink
              key={item.to}
              href={portAwareHref(item.to, state)}
              className={`navlink ${isActive(path, item.to, item.exact) ? "active" : ""}`}
              aria-current={isActive(path, item.to, item.exact) ? "page" : undefined}
            >
              {item.label}
            </AppLink>
          ))}
        </nav>
        <div className="row hide-sm">
          <AppLink href={portAwareHref("/search", state)} className="top-search-link">
            ابحث في القنوات والاستراحة
          </AppLink>
          <LiveIndicator />
        </div>
      </header>
      <main id="main" className="container page grow">
        {children}
      </main>
      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي للجوال">
        {NAV.map((item) => {
          const active = isActive(path, item.to, item.exact);
          return (
            <AppLink
              key={item.to}
              href={portAwareHref(item.to, state)}
              className={`mobile-nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-nav-glyph" aria-hidden><NavIcon name={item.icon} /></span>
              <span>{item.short}</span>
            </AppLink>
          );
        })}
      </nav>
      <footer className="viewer-footer container">
        {brand} — مشاهدة داخل الشبكة
      </footer>
    </div>
  );
}
