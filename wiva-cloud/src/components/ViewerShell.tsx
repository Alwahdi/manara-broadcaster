import Link from "next/link";
import { Search, Tv2, UserRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { ViewerNavigation } from "@/components/ViewerNavigation";

export function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="viewer-shell">
      <header className="viewer-header">
        <div className="viewer-header-inner">
          <Link href="/" className="brand-link"><BrandMark /></Link>
          <ViewerNavigation />
          <div className="header-actions">
            <Link href="/search" className="icon-button" aria-label="بحث"><Search size={20} /></Link>
            <Link href="/account" className="account-button">
              <UserRound size={18} />
              <span>حسابي</span>
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <ViewerNavigation mobile />
      <footer className="viewer-footer">
        <BrandMark compact />
        <p>كل قنواتك وأفلامك ومسلسلاتك في مكان واحد.</p>
        <span><Tv2 size={16} /> يعمل على الجوال والتلفزيون والمتصفح</span>
      </footer>
    </div>
  );
}
