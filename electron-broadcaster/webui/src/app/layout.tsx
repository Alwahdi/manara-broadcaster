import type { Metadata, Viewport } from "next";
import "@/styles/theme.css";
import "@/styles/layouts.css";

export const metadata: Metadata = {
  title: "WIVA",
  description: "WIVA local network streaming, IPTV, and media library.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
