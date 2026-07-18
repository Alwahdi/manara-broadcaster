"use client";

import Link from "next/link";
import { Clapperboard, Film, Home, Radio, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/live", label: "مباشر", icon: Radio },
  { href: "/movies", label: "أفلام", icon: Film },
  { href: "/series", label: "مسلسلات", icon: Clapperboard },
];

function activePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function ViewerNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav className={mobile ? "mobile-nav" : "desktop-nav"} aria-label={mobile ? "التنقل السريع" : "التنقل الرئيسي"}>
    {items.map(({ href, label, icon: Icon }) => {
      const active = activePath(pathname, href);
      return <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} prefetch>
        {mobile ? <Icon size={20} /> : null}<span>{label}</span>
      </Link>;
    })}
    {mobile ? <Link href="/account" prefetch className={activePath(pathname, "/account") || activePath(pathname, "/login") || activePath(pathname, "/signup") ? "active" : undefined}><UserRound size={20} /><span>حسابي</span></Link> : null}
  </nav>;
}
