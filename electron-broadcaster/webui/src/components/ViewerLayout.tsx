import { Link, Outlet } from "@tanstack/react-router";
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

export function ViewerLayout() {
  const { brand } = useBrand();
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">تخطَّ إلى المحتوى</a>
      <OfflineBanner />
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/wiva-logo.png" alt="" className="brand-logo" />
          <span>{brand}</span>
        </Link>
        <nav className="topnav grow" aria-label="التنقل الرئيسي">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="navlink"
              activeProps={{ className: "navlink active", "aria-current": "page" }}
              activeOptions={{ exact: item.exact }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="row hide-sm">
          <LiveIndicator />
        </div>
      </header>
      <main id="main" className="container page grow">
        <Outlet />
      </main>
      <footer className="container" style={{ padding: "24px 0", color: "var(--text-dim)", fontSize: "0.82rem" }}>
        {brand} — شبكة محلية
      </footer>
    </div>
  );
}
