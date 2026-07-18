import { ViewerShell } from "@/components/ViewerShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewerShell>{children}</ViewerShell>;
}
