import Link from "next/link";
import { Activity, LogOut, RadioTower, ShieldCheck } from "lucide-react";
import { AdminNavigation } from "@/components/AdminNavigation";
import { BrandMark } from "@/components/BrandMark";
import { requireAdminPage } from "@/lib/auth";

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/admin"><BrandMark /></Link>
        <div className="admin-status"><i /><span><strong>لوحة الإدارة</strong><small>جاهزة لإدارة المحتوى والمشاهدين</small></span></div>
        <AdminNavigation />
        <div className="sidebar-note"><ShieldCheck size={20} /><p>بيانات المزوّد مشفّرة ولا تظهر للمشاهدين.</p></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div><RadioTower size={20} /><span>إدارة WIVA</span></div>
          <div className="admin-topbar-actions">
            <div className="admin-identity"><Activity size={16} /><span>{admin.email}</span></div>
            <form action="/api/auth/admin/logout" method="post">
              <button className="admin-logout" type="submit" aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut size={17} /></button>
            </form>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
