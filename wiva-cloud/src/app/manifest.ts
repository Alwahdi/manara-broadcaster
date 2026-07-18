import type { MetadataRoute } from "next";
import { brandName } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brandName(), short_name: brandName(),
    description: "قنوات وأفلام ومسلسلات في مكان واحد.",
    start_url: "/", display: "standalone", orientation: "any",
    background_color: "#070910", theme_color: "#070910", lang: "ar", dir: "rtl",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }, { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
