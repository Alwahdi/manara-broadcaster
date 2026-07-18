import type { Metadata, Viewport } from "next";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "@/app/globals.css";
import { brandName } from "@/lib/env";

export const metadata: Metadata = {
  title: { default: brandName(), template: `%s | ${brandName()}` },
  description: "قنوات مباشرة وأفلام ومسلسلات في تجربة عربية سهلة وسريعة.",
  applicationName: brandName(), manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/brand-icon", type: "image/png" }], shortcut: "/brand-icon", apple: "/brand-icon" },
  appleWebApp: { capable: true, title: brandName(), statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080808",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
