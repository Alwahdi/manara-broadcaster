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
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: brandName(), statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070910",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
