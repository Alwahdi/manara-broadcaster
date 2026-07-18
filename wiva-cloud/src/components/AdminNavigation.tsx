"use client";

import Link from "next/link";
import { CalendarDays, Clapperboard, LayoutDashboard, ServerCog, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/admin/providers", label: "المزوّدون", icon: ServerCog },
  { href: "/admin/channels", label: "المحتوى", icon: Clapperboard },
  { href: "/admin/schedule", label: "المباريات", icon: CalendarDays },
  { href: "/admin/viewers", label: "المشاهدون", icon: UsersRound },
];

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="التنقّل في لوحة الإدارة">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link className={active ? "active" : undefined} href={href} key={href} aria-current={active ? "page" : undefined}>
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
