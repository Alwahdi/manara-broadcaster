import Link from "next/link";
import { Activity, Clapperboard, LayoutDashboard, RadioTower, ServerCog, ShieldCheck, UsersRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { requireAdminPage } from "@/lib/auth";

const nav = [
  { href: "/admin", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/admin/providers", label: "المزوّدون", icon: ServerCog },
  { href: "/admin/channels", label: "المحتوى", icon: Clapperboard },
  { href: "/admin/viewers", label: "المشاهدون", icon: UsersRound },
];

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin"><BrandMark /></Link>
        <div className="admin-status"><i /><span><strong>Control plane</strong><small>جاهز لإدارة المصادر المرخّصة</small></span></div>
        <nav>{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon size={19} />{label}</Link>)}</nav>
        <div className="sidebar-note"><ShieldCheck size={20} /><p>بيانات المزوّد مشفّرة ولا تظهر للمشاهدين.</p></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div><RadioTower size={20} /><span>WIVA Cloud Operations</span></div>
          <div className="admin-identity"><Activity size={16} /><span>{admin.email}</span></div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
