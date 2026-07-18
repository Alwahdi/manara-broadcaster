import type { CatalogAsset } from "@/lib/types";

const languageNames: Record<string, string> = {
  AR: "العربية", ARABIC: "العربية", EN: "الإنجليزية", ENGLISH: "الإنجليزية",
  FR: "الفرنسية", FRENCH: "الفرنسية", DE: "الألمانية", GERMAN: "الألمانية",
  ES: "الإسبانية", SPANISH: "الإسبانية", TR: "التركية", TURKISH: "التركية",
};

export function publicLanguage(value: string) {
  const normalized = value.trim().toUpperCase();
  return languageNames[normalized] || value.trim();
}

export function publicAssetTitle(asset: CatalogAsset) {
  let title = asset.title.trim()
    .replace(/^(?:AR|EN|FR|DE|ES|TR|US|UK|CA|AU|BE|IN)\s*:\s*/i, "")
    .replace(/\s*\((?:FHD|HD|SD|UHD|4K|HEVC|H265)(?:\/[^)]*)?\)\s*$/i, "")
    .replace(/\s*[-–]\s*S\d{1,2}E\d{1,3}\s*[-–]\s*Episode\s*#?\d+\s*$/i, "")
    .replace(/\s*\([A-Z]\)\s*$/i, "")
    .trim();
  if (!title) title = asset.title.trim();
  if (asset.parentAssetId && asset.episodeNumber) return `${title} — الحلقة ${asset.episodeNumber.toLocaleString("ar")}`;
  return title;
}
