import type { ReactNode } from "react";
import { Heart, Home, Library, Radio, Search, UserRound, type LucideIcon } from "lucide-react";
import { AppLink, useAppPath } from "@/components/AppLink";
import { useBrand } from "@/hooks/useBrand";
import { OfflineBanner } from "@/components/OfflineBanner";

const NAV: Array<{ to: string; label: string; short: string; icon: LucideIcon; exact?: boolean; primary?: boolean; desktop?: boolean }> = [
  { to: "/", label: "الرئيسية", short: "الرئيسية", icon: Home, exact: true, desktop: true },
  { to: "/library", label: "المكتبة", short: "المكتبة", icon: Library, desktop: true },
  { to: "/live", label: "البث المباشر", short: "مباشر", icon: Radio, primary: true, desktop: true },
  { to: "/favorites", label: "المفضلة", short: "المفضلة", icon: Heart },
  { to: "/account", label: "الحساب والإعدادات", short: "حسابي", icon: UserRound, desktop: true },
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
          {NAV.filter((item) => item.desktop).map((item) => (
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
        <AppLink href={portAwareHref("/search", state)} className="viewer-search-button" aria-label="البحث">
          <Search size={20} />
          <span>ابحث في القنوات والمكتبة</span>
        </AppLink>
      </header>
      <main id="main" className="container page grow">
        {children}
      </main>
      <nav className="mobile-bottom-nav" aria-label="التنقل الرئيسي للجوال">
        {NAV.map((item) => {
          const active = isActive(path, item.to, item.exact);
          const Icon = item.icon;
          return (
            <AppLink
              key={item.to}
              href={portAwareHref(item.to, state)}
              className={`mobile-nav-item ${item.primary ? "primary-destination" : ""} ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-nav-glyph" aria-hidden><Icon size={20} /></span>
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
