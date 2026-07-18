import type { MetadataRoute } from "next";
import { brandName } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brandName(), short_name: brandName(),
    description: "قنوات وأفلام ومسلسلات في مكان واحد.",
    start_url: "/", display: "standalone", orientation: "any",
    background_color: "#070910", theme_color: "#070910", lang: "ar", dir: "rtl",
    icons: [{ src: "/brand-icon", sizes: "128x72", type: "image/png", purpose: "any" }],
  };
}
