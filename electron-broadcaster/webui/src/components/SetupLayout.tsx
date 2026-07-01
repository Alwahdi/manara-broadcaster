import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useBrand } from "@/hooks/useBrand";

export const SETUP_STEPS = [
  { to: "/setup/welcome", label: "ترحيب" },
  { to: "/setup/network", label: "الشبكة" },
  { to: "/setup/admin-account", label: "حساب المشرف" },
  { to: "/setup/branding", label: "الهوية" },
  { to: "/setup/ports", label: "المنافذ" },
  { to: "/setup/library", label: "المكتبة" },
  { to: "/setup/iptv", label: "IPTV" },
  { to: "/setup/finish", label: "إنهاء" },
];

export function SetupLayout() {
  const { brand } = useBrand();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentIndex = SETUP_STEPS.findIndex((s) => s.to === pathname);
  return (
    <div className="setup">
      <aside className="setup-rail">
        <div className="brand" style={{ marginBottom: 24 }}>
          <img src="/wiva-logo.png" alt="" className="brand-logo" />
          <span>{brand}</span>
        </div>
        {SETUP_STEPS.map((step, i) => {
          const state = i === currentIndex ? "active" : i < currentIndex ? "done" : "";
          return (
            <Link key={step.to} to={step.to} className={`step ${state}`}>
              <span className="step-num">{i < currentIndex ? "✓" : i + 1}</span>
              <span>{step.label}</span>
            </Link>
          );
        })}
      </aside>
      <main className="setup-body">
        <Outlet />
      </main>
    </div>
  );
}
