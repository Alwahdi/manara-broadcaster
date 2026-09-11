import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
  const [mobile, setMobile] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const path = useAppPath();
  const active = GROUPS.flatMap((group) => group.items)
    .filter((item) => isActive(path, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const modalOpen = mobile && open;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const sync = () => { setMobile(media.matches); setOpen(false); };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") || []);
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const focusable = items();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      if (window.matchMedia("(max-width: 980px)").matches) toggle.current?.focus();
      else document.getElementById("main")?.focus();
    };
  }, [modalOpen]);

  return (
    <div className="admin">
      <a href="#main" className="skip-link" inert={modalOpen}>تخطَّ إلى المحتوى</a>
      {modalOpen ? <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setOpen(false)} /> : null}
      <aside ref={sidebar} id="admin-navigation" className={`sidebar ${open ? "open" : ""}`} aria-label="تنقل لوحة الإدارة" role={modalOpen ? "dialog" : undefined} aria-modal={modalOpen || undefined} inert={mobile && !open}>
        <button type="button" className="btn btn-ghost menu-toggle" onClick={() => setOpen(false)}>إغلاق القائمة</button>
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
                className={`sidelink ${active?.to === item.to ? "active" : ""}`}
                aria-current={active?.to === item.to ? "page" : undefined}
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

      <div className="admin-main" inert={modalOpen}>
        <OfflineBanner />
        <header className="admin-topbar">
          <button
            ref={toggle}
            type="button"
            className="btn btn-ghost btn-sm menu-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label="القائمة"
            aria-expanded={open}
            aria-controls="admin-navigation"
          >
            ☰
          </button>
          <div className="row grow admin-topbar-row">
            <strong>{active?.label || "لوحة الإدارة"}</strong>
            <div className="row">
              <Gauge className="admin-topbar-icon" aria-hidden />
              <LiveIndicator />
            </div>
          </div>
        </header>
        <main id="main" className="admin-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
