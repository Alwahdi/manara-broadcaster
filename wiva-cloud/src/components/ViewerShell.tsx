import Link from "next/link";
import { Clapperboard, Film, Home, LogIn, Radio, Search, Tv2, UserRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { currentViewer } from "@/lib/auth";

const nav = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/live", label: "مباشر", icon: Radio },
  { href: "/movies", label: "أفلام", icon: Film },
  { href: "/series", label: "مسلسلات", icon: Clapperboard },
];

export async function ViewerShell({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();
  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div className="viewer-header-inner">
          <Link href="/" className="brand-link"><BrandMark /></Link>
          <nav className="desktop-nav" aria-label="التنقل الرئيسي">
            {nav.map(({ href, label }) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
          <div className="header-actions">
            <Link href="/search" className="icon-button" aria-label="بحث"><Search size={20} /></Link>
            <Link href={viewer ? "/account" : "/login"} className="account-button">
              {viewer ? <UserRound size={18} /> : <LogIn size={18} />}
              <span>{viewer?.name || "دخول"}</span>
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <nav className="mobile-nav" aria-label="التنقل السريع">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}><Icon size={20} /><span>{label}</span></Link>
        ))}
        <Link href={viewer ? "/account" : "/login"}><UserRound size={20} /><span>حسابي</span></Link>
      </nav>
      <footer className="viewer-footer">
        <BrandMark compact />
        <p>مشاهدة آمنة للمحتوى المرخّص عبر WIVA Media Gateway.</p>
        <span><Tv2 size={16} /> يعمل على الجوال والتلفزيون والمتصفح</span>
      </footer>
    </div>
  );
}
