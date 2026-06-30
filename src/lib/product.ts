export const PRODUCT = {
  name: "WIVA",
  agentName: "WIVA Agent",
  adminName: "WIVA Admin",
  viewerName: "WIVA TV",
  arabicName: "ويفا",
  legacyName: "Manara",
  repo: "manara-broadcaster",
  downloadFile: "WIVA-2.6.3-x64.zip",
  supportEmail: "support@wiva.app",
} as const;

export function pageTitle(title: string) {
  return `${title} — ${PRODUCT.name}`;
}
