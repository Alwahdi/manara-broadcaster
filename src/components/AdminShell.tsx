import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, LayoutDashboard, KeyRound, Globe2, Tv, FolderTree, Folder, Palette, Megaphone, MessageSquare, Loader2, Download, Radio } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PRODUCT } from "@/lib/product";

const items = [
  { to: "/admin/licenses", label: "التراخيص", icon: KeyRound },
  { to: "/admin/releases", label: "الإصدارات", icon: Download },
  { to: "/admin/networks", label: "الشبكات", icon: Globe2 },
  { to: "/admin", label: "القنوات", icon: Tv },
  { to: "/admin/iptv", label: "IPTV", icon: Radio },
  { to: "/admin/categories", label: "التصنيفات", icon: FolderTree },
  { to: "/admin/paths", label: "المكتبات", icon: Folder },
  { to: "/admin/themes", label: "العلامة", icon: Palette },
  { to: "/admin/tickers", label: "الشريط", icon: Megaphone },
  { to: "/admin/messages", label: "الرسائل", icon: MessageSquare },
] as const;

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate({ to: "/login/admin" }); }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <div dir="rtl" className="flex min-h-[100dvh] items-center justify-center p-6">
        <div className="glass-panel rounded-3xl p-8 text-center max-w-md">
          <h1 className="text-xl font-bold mb-2">صلاحيات غير كافية</h1>
          <p className="text-muted-foreground mb-4">هذه الصفحة للمسؤولين فقط.</p>
          <Link to="/" className="text-primary underline">العودة للرئيسية</Link>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-primary">{PRODUCT.adminName}</div>
            <h1 className="truncate text-lg font-bold">{title}</h1>
          </div>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> الرئيسية
          </Link>
        </div>
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 pb-2 flex gap-1 overflow-x-auto">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 whitespace-nowrap"
              activeProps={{ className: "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-foreground bg-white/10 whitespace-nowrap" }}
              activeOptions={{ exact: true }}
            >
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
