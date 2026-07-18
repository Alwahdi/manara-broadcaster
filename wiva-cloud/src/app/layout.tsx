import type { Metadata, Viewport } from "next";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "@/app/globals.css";
import { brandName } from "@/lib/env";

export const metadata: Metadata = {
  title: { default: `${brandName()} Cloud`, template: `%s | ${brandName()} Cloud` },
  description: "منصة WIVA المرخّصة للقنوات المباشرة والأفلام والمكتبة الإعلامية.",
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
