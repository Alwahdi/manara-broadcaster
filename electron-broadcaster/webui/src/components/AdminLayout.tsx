import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AppLink, useAppPath } from "@/components/AppLink";
import { useBrand } from "@/hooks/useBrand";
import { LiveIndicator } from "@/components/LiveIndicator";
import { OfflineBanner } from "@/components/OfflineBanner";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Clapperboard,
  FlaskConical,
  FolderTree,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Mail,
  Palette,
  Satellite,
  ScrollText,
  Settings,
  ShieldCheck,
  Tv,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

const GROUPS: { label: string; items: { to: string; label: string; icon: LucideIcon }[] }[] = [
  {
    label: "نظرة عامة",
    items: [
      { to: "/admin/dashboard", label: "لوحة المعلومات", icon: LayoutDashboard },
      { to: "/admin/diagnostics", label: "التشخيص", icon: Activity },
      { to: "/admin/reports", label: "التقارير", icon: BarChart3 },
    ],
  },
  {
    label: "البث والقنوات",
    items: [
      { to: "/admin/channels", label: "القنوات", icon: Tv },
      { to: "/admin/capture", label: "أجهزة الالتقاط", icon: Video },
      { to: "/admin/iptv", label: "قنوات IPTV", icon: Satellite },
    ],
  },
  {
    label: "المكتبة",
    items: [
      { to: "/admin/library", label: "المكتبة", icon: Clapperboard },
      { to: "/admin/library/sources", label: "مصادر التخزين", icon: HardDrive },
      { to: "/admin/library/browser", label: "متصفح الملفات", icon: FolderTree },
    ],
  },
  {
    label: "الجمهور",
    items: [
      { to: "/admin/viewers", label: "المشاهدون", icon: Users },
      { to: "/admin/messages", label: "الرسائل", icon: Mail },
    ],
  },
  {
    label: "الإعدادات",
    items: [
      { to: "/admin/branding", label: "الهوية", icon: Palette },
      { to: "/admin/security", label: "الأمان", icon: ShieldCheck },
      { to: "/admin/logs", label: "السجلات", icon: ScrollText },
      { to: "/admin/settings", label: "الإعدادات", icon: Settings },
      { to: "/admin/advanced", label: "متقدم", icon: FlaskConical },
    ],
  },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { brand, logo } = useBrand();
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
          <img src={logo} alt="" className="brand-logo" />
          <span>{brand}</span>
        </AppLink>
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="side-group-label">{group.label}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
              <AppLink
                key={item.to}
                href={item.to}
                className={`sidelink ${isActive(path, item.to) ? "active" : ""}`}
                aria-current={isActive(path, item.to) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="sidelink-icon" aria-hidden><Icon /></span>
                <span>{item.label}</span>
              </AppLink>
              );
            })}
          </div>
        ))}
        <div className="side-group-label">أخرى</div>
        <AppLink className="sidelink" href="/">
          <span className="sidelink-icon" aria-hidden><ArrowLeft /></span>
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
          <div className="row grow admin-topbar-row">
            <strong className="hide-sm">لوحة الإدارة</strong>
            <div className="row">
              <Gauge className="admin-topbar-icon" aria-hidden />
              <LiveIndicator />
            </div>
          </div>
        </header>
        <main id="main" className="admin-content">{children}</main>
      </div>
    </div>
  );
}
