const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";

export function tenantId() {
  return process.env.WIVA_TENANT_ID?.trim() || DEFAULT_TENANT;
}

export function brandName() {
  return process.env.NEXT_PUBLIC_WIVA_BRAND_NAME?.trim() || "WIVA";
}

export function isDemoMode() {
  return process.env.NEXT_PUBLIC_WIVA_DEMO_MODE === "true";
}

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function appUrl() {
  return process.env.WIVA_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:5280";
}
