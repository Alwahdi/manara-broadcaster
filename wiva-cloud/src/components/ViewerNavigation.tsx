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

const mobileItems = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/movies", label: "أفلام", icon: Film },
  { href: "/live", label: "مباشر", icon: Radio, primary: true },
  { href: "/series", label: "مسلسلات", icon: Clapperboard },
  { href: "/account", label: "حسابي", icon: UserRound },
];

function activePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function ViewerNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav className={mobile ? "mobile-nav" : "desktop-nav"} aria-label={mobile ? "التنقل السريع" : "التنقل الرئيسي"}>
    {(mobile ? mobileItems : items).map(({ href, label, icon: Icon, ...item }) => {
      const active = activePath(pathname, href) || (href === "/account" && (activePath(pathname, "/login") || activePath(pathname, "/signup")));
      return <Link key={href} href={href} className={`${active ? "active" : ""} ${"primary" in item && item.primary ? "primary-destination" : ""}`.trim()} aria-current={active ? "page" : undefined} prefetch>
        {mobile ? <Icon size={20} /> : null}<span>{label}</span>
      </Link>;
    })}
  </nav>;
}
