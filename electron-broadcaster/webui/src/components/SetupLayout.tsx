import type { ReactNode } from "react";
import { AppLink, useAppPath } from "@/components/AppLink";
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

export function SetupLayout({ children }: { children: ReactNode }) {
  const { brand } = useBrand();
  const pathname = useAppPath();
  const currentIndex = SETUP_STEPS.findIndex((s) => s.to === pathname);
  return (
    <div className="setup">
      <a href="#main" className="skip-link">تخطَّ إلى المحتوى</a>
      <aside className="setup-rail">
        <div className="brand" style={{ marginBottom: 24 }}>
          <img src="/wiva-logo.png" alt="" className="brand-logo" />
          <span>{brand}</span>
        </div>
        {SETUP_STEPS.map((step, i) => {
          const state = i === currentIndex ? "active" : i < currentIndex ? "done" : "";
          return (
            <AppLink
              key={step.to}
              href={step.to}
              className={`step ${state}`}
              aria-current={i === currentIndex ? "step" : undefined}
            >
              <span className="step-num">{i < currentIndex ? "✓" : i + 1}</span>
              <span>{step.label}</span>
            </AppLink>
          );
        })}
      </aside>
      <main id="main" className="setup-body">
        {children}
      </main>
    </div>
  );
}
