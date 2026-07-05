import type { ReactNode } from "react";
import { AppLink, useAppPath } from "@/components/AppLink";
import { useBrand } from "@/hooks/useBrand";
import { LiveIndicator } from "@/components/LiveIndicator";
import { OfflineBanner } from "@/components/OfflineBanner";

const NAV = [
  { to: "/", label: "الرئيسية", exact: true },
  { to: "/live", label: "البث المباشر" },
  { to: "/library", label: "المكتبة" },
  { to: "/search", label: "بحث" },
  { to: "/favorites", label: "المفضلة" },
  { to: "/account", label: "حسابي" },
];

function isActive(path: string, href: string, exact?: boolean) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

export function ViewerLayout({ children }: { children: ReactNode }) {
  const { brand, logo } = useBrand();
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
              href={item.to}
              className={`navlink ${isActive(path, item.to, item.exact) ? "active" : ""}`}
              aria-current={isActive(path, item.to, item.exact) ? "page" : undefined}
            >
              {item.label}
            </AppLink>
          ))}
        </nav>
        <div className="row hide-sm">
          <LiveIndicator />
        </div>
      </header>
      <main id="main" className="container page grow">
        {children}
      </main>
      <footer className="container" style={{ padding: "24px 0", color: "var(--text-dim)", fontSize: "0.82rem" }}>
        {brand} — شبكة محلية
      </footer>
    </div>
  );
}
