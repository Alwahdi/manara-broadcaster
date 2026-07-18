import { AdminShell } from "@/components/AdminShell";
export const dynamic = "force-dynamic";
export default function Layout({ children }: { children: React.ReactNode }) { return <AdminShell>{children}</AdminShell>; }
