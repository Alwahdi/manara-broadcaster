function normalizePortSetting(value, fallback) {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const digits = String(value).trim().replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)));
  if (!/^\d+$/.test(digits)) return fallback;
  const port = Number(digits);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

module.exports = {
  normalizePortSetting,
};
