import Link from "next/link";
import { LogIn, Search, Tv2, UserRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { ViewerNavigation } from "@/components/ViewerNavigation";
import { currentViewerAccount } from "@/lib/auth";

export async function ViewerShell({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewerAccount();
  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div className="viewer-header-inner">
          <Link href="/" className="brand-link"><BrandMark /></Link>
          <ViewerNavigation accountHref={viewer ? "/account" : "/login"} />
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
      <ViewerNavigation mobile accountHref={viewer ? "/account" : "/login"} />
      <footer className="viewer-footer">
        <BrandMark compact />
        <p>كل قنواتك وأفلامك ومسلسلاتك في مكان واحد.</p>
        <span><Tv2 size={16} /> يعمل على الجوال والتلفزيون والمتصفح</span>
      </footer>
    </div>
  );
}
