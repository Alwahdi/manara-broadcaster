// WIVA — shared server-side data presentation helpers.
// Keeping these in one place guarantees numbers, sizes, and durations are
// rendered consistently across the admin panel, reports, and watch pages,
// and makes them unit-testable in isolation.

// Format an actual amount of stored/transferred data. Unknown or zero values
// render as "0 B" (an accurate measurement), never as "no limit".
function formatDataBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Format a configured transfer cap. Here zero/empty deliberately means
// "no limit" ("بدون حد"), which is a distinct meaning from a data size.
function formatTransferLimit(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return 'بدون حد';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Format a duration in seconds as H:MM:SS or M:SS. Empty for zero/unknown.
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = { formatDataBytes, formatTransferLimit, formatDuration };
