import Link from "next/link";
import { Search, UserRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { NavigationProgress } from "@/components/NavigationProgress";
import { ViewerNavigation } from "@/components/ViewerNavigation";

export function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="viewer-shell">
      <a className="skip-link" href="#viewer-content">تجاوز إلى المحتوى</a>
      <NavigationProgress />
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
      <main id="viewer-content">{children}</main>
      <ViewerNavigation mobile />
    </div>
  );
}
