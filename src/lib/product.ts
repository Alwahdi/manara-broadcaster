export const PRODUCT = {
  name: "ويفا",
  agentName: "وكيل ويفا",
  adminName: "لوحة تحكم ويفا",
  viewerName: "تلفزيون ويفا",
  libraryName: "مكتبة ويفا",
  setupName: "إعداد ويفا",
  arabicName: "ويفا",
  legacyName: "Manara",
  repo: "manara-broadcaster",
  downloadFile: "WIVA-2.6.4-x64.zip",
  supportEmail: "support@wiva.app",
} as const;

export function pageTitle(title: string) {
  return `${title} — ${PRODUCT.name}`;
}
