export function setupAdminUrl(adminLocal: string | undefined, currentHref: string): string {
  const current = new URL(currentHref);
  const fallback = new URL("/admin/dashboard", current);
  if (!adminLocal) return fallback.href;
  try {
    const target = new URL(adminLocal, current);
    if (!["http:", "https:"].includes(target.protocol)) return fallback.href;
    // Agent URLs describe the server's loopback address, not the browser's host.
    target.hostname = current.hostname;
    target.protocol = current.protocol;
    target.username = "";
    target.password = "";
    return target.href;
  } catch {
    return fallback.href;
  }
}
