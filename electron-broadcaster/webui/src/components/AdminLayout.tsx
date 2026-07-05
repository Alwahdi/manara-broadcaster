import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AppLink, useAppPath } from "@/components/AppLink";
import { useBrand } from "@/hooks/useBrand";
import { LiveIndicator } from "@/components/LiveIndicator";
import { OfflineBanner } from "@/components/OfflineBanner";

const GROUPS: { label: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    label: "نظرة عامة",
    items: [
      { to: "/admin/dashboard", label: "لوحة المعلومات", icon: "📊" },
      { to: "/admin/diagnostics", label: "التشخيص", icon: "🩺" },
      { to: "/admin/reports", label: "التقارير", icon: "📈" },
    ],
  },
  {
    label: "البث والقنوات",
    items: [
      { to: "/admin/channels", label: "القنوات", icon: "📺" },
      { to: "/admin/capture", label: "أجهزة الالتقاط", icon: "🎥" },
      { to: "/admin/iptv", label: "قنوات IPTV", icon: "🛰️" },
    ],
  },
  {
    label: "المكتبة",
    items: [
      { to: "/admin/library", label: "المكتبة", icon: "🎬" },
      { to: "/admin/library/sources", label: "مصادر التخزين", icon: "💾" },
      { to: "/admin/library/browser", label: "متصفح الملفات", icon: "🗂️" },
    ],
  },
  {
    label: "الجمهور",
    items: [
      { to: "/admin/viewers", label: "المشاهدون", icon: "👥" },
      { to: "/admin/messages", label: "الرسائل", icon: "✉️" },
    ],
  },
  {
    label: "الإعدادات",
    items: [
      { to: "/admin/branding", label: "الهوية", icon: "🎨" },
      { to: "/admin/security", label: "الأمان", icon: "🔒" },
      { to: "/admin/logs", label: "السجلات", icon: "📜" },
      { to: "/admin/settings", label: "الإعدادات", icon: "⚙️" },
      { to: "/admin/advanced", label: "متقدم", icon: "🧪" },
    ],
  },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { brand } = useBrand();
  const [open, setOpen] = useState(false);
  const path = useAppPath();

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <div className="admin">
      <a href="#main" className="skip-link">تخطَّ إلى المحتوى</a>
      {open ? <div className="sidebar-backdrop" onClick={() => setOpen(false)} /> : null}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="تنقل لوحة الإدارة">
        <AppLink href="/admin/dashboard" className="sidebar-brand" onClick={() => setOpen(false)}>
          <img src="/wiva-logo.png" alt="" className="brand-logo" />
          <span>{brand}</span>
        </AppLink>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="side-group-label">{group.label}</div>
            {group.items.map((item) => (
              <AppLink
                key={item.to}
                href={item.to}
                className={`sidelink ${isActive(path, item.to) ? "active" : ""}`}
                aria-current={isActive(path, item.to) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="sidelink-icon" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </AppLink>
            ))}
          </div>
        ))}
        <div className="side-group-label">أخرى</div>
        <AppLink className="sidelink" href="/">
          <span className="sidelink-icon" aria-hidden>↩️</span>
          <span>واجهة المشاهدة</span>
        </AppLink>
      </aside>

      <div className="admin-main">
        <OfflineBanner />
        <header className="admin-topbar">
          <button
            className="btn btn-ghost btn-sm menu-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label="القائمة"
            aria-expanded={open}
          >
            ☰
          </button>
          <div className="row grow" style={{ justifyContent: "space-between" }}>
            <strong className="hide-sm">لوحة الإدارة</strong>
            <div className="row">
              <LiveIndicator />
            </div>
          </div>
        </header>
        <main id="main" className="admin-content">{children}</main>
      </div>
    </div>
  );
}
