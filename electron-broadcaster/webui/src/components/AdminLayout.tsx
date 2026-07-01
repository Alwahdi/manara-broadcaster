import { useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { useBrand } from "@/hooks/useBrand";
import { LiveIndicator } from "@/components/LiveIndicator";

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

export function AdminLayout() {
  const { brand } = useBrand();
  const [open, setOpen] = useState(false);
  return (
    <div className="admin">
      {open ? <div className="sidebar-backdrop" onClick={() => setOpen(false)} /> : null}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link to="/admin/dashboard" className="sidebar-brand" onClick={() => setOpen(false)}>
          <img src="/wiva-logo.png" alt="" className="brand-logo" />
          <span>{brand}</span>
        </Link>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="side-group-label">{group.label}</div>
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="sidelink"
                activeProps={{ className: "sidelink active" }}
                onClick={() => setOpen(false)}
              >
                <span className="sidelink-icon" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
        <div className="side-group-label">أخرى</div>
        <a className="sidelink" href="/">
          <span className="sidelink-icon" aria-hidden>↩️</span>
          <span>واجهة المشاهدة</span>
        </a>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="btn btn-ghost btn-sm menu-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label="القائمة"
          >
            ☰
          </button>
          <div className="row grow" style={{ justifyContent: "space-between" }}>
            <strong className="hide-sm">لوحة الإدارة</strong>
            <div className="row">
              <LiveIndicator />
              <a className="btn btn-ghost btn-sm" href="/admin/legacy">الواجهة القديمة</a>
            </div>
          </div>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
