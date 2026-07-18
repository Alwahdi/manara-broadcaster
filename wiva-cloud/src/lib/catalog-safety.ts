import type { ProviderCatalogItem } from "@/lib/types";

const restrictedTerms = [
  /\badult\b/i,
  /\bxxx\b/i,
  /\b18\s*\+\b/i,
  /\bporn(?:o|ography)?\b/i,
  /\bplayboy\b/i,
  /\bbrazzers\b/i,
  /\bhustler\b/i,
  /\bredlight\b/i,
  /\bdorcel\b/i,
  /\bpenthouse\b/i,
  /\bhardcore\b/i,
  /\bvivid\s*(?:tv|red|touch)?\b/i,
  /\berotic\b/i,
  /\bsex(?:y)?\b/i,
  /\b(?:stepdaughter|stepsister|stepmom|milf|nude|nudity|onlyfans|pornhub)\b/i,
  /\bhot\s*(?:club|night|girls?)\b/i,
  /للبالغين|إباحي|اباحي|عاري|عري|جنس(?:ي|ية)?/i,
];

const scheduleTerms = [
  /جدول\s*(?:المباريات|المباراة)/i,
  /مواعيد\s*(?:المباريات|المباراة)/i,
  /\bmatch(?:es)?\s*schedule\b/i,
  /\bfixtures?\b/i,
  /\bepg\b/i,
];

const languageAliases: Record<string, string> = {
  AR: "العربية",
  ARA: "العربية",
  ARABIC: "العربية",
  EN: "الإنجليزية",
  ENG: "الإنجليزية",
  ENGLISH: "الإنجليزية",
  FR: "الفرنسية",
  FRE: "الفرنسية",
  FRENCH: "الفرنسية",
  TR: "التركية",
  TURKISH: "التركية",
};

export function isRestrictedMetadata(...values: Array<string | null | undefined>) {
  const haystack = values.filter(Boolean).join(" ");
  return restrictedTerms.some((term) => term.test(haystack));
}

export function isScheduleMetadata(...values: Array<string | null | undefined>) {
  const haystack = values.filter(Boolean).join(" ");
  return scheduleTerms.some((term) => term.test(haystack));
}

export function normalizeProviderTitle(value: string) {
  const cleaned = value
    .replace(/^(?:AR|EN|FR|DE|ES|TR|US|UK|CA|AU|BE|IN)\s*[:|·-]\s*/i, "")
    .replace(/\s*[|·]\s*(?:AR|EN|FR|DE|ES|TR|US|UK|CA|AU|BE)\s*$/i, "")
    .replace(/\s*[\[(](?:FHD|HD|SD|UHD|4K|HEVC|H\.?265)(?:[\s/|-][^\])]+)?[\])]\s*$/i, "")
    .replace(/\s*\([A-Z]\)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || value.trim();
}

export function normalizeProviderCategory(value: string) {
  return value
    .replace(/^(?:AR|EN|FR|DE|ES|TR|US|UK|CA|AU|BE|IN)\s*[:|·-]\s*/i, "")
    .replace(/[_|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeProviderLanguage(value: string) {
  const normalized = value.trim().toUpperCase();
  return languageAliases[normalized] || value.trim();
}

export function prepareCatalogItem(item: ProviderCatalogItem) {
  const title = normalizeProviderTitle(item.title);
  const category = normalizeProviderCategory(item.category);
  return {
    ...item,
    title,
    category,
    language: normalizeProviderLanguage(item.language),
    restricted: isRestrictedMetadata(item.title, item.category, item.description),
    playable: !isScheduleMetadata(item.title, item.category, item.description),
  };
}

export function catalogIdentity(item: ProviderCatalogItem) {
  const prepared = prepareCatalogItem(item);
  return [prepared.kind, prepared.title.toLocaleLowerCase("ar"), prepared.year || "", prepared.quality.toUpperCase(), prepared.category.toLocaleLowerCase("ar")].join("|");
}
