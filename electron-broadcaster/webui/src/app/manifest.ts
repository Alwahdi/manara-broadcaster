import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WIVA",
    short_name: "WIVA",
    description: "WIVA local network streaming, IPTV, and media library.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#080b12",
    theme_color: "#080b12",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icons/wiva-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/wiva-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/wiva-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
