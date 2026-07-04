const assert = require('node:assert/strict');

const {
  formatDataBytes,
  formatTransferLimit,
  formatDuration,
} = require('../library/format.cjs');

// --- formatDataBytes: an actual measured amount of data ---
// Zero / unknown / invalid must read as an accurate "0 B", never "no limit".
assert.equal(formatDataBytes(0), '0 B');
assert.equal(formatDataBytes(undefined), '0 B');
assert.equal(formatDataBytes(null), '0 B');
assert.equal(formatDataBytes(-5), '0 B');
assert.equal(formatDataBytes(NaN), '0 B');
assert.equal(formatDataBytes(Infinity), '0 B');
assert.equal(formatDataBytes('not a number'), '0 B');
assert.equal(formatDataBytes(512), '512 B');
assert.equal(formatDataBytes(1023), '1023 B');
assert.equal(formatDataBytes(1024), '1.0 KB');
assert.equal(formatDataBytes(1536), '1.5 KB');
assert.equal(formatDataBytes(5 * 1024 * 1024), '5.0 MB');
assert.equal(formatDataBytes(3 * 1024 * 1024 * 1024), '3.00 GB');
// String numbers coming from JSON storage should still format.
assert.equal(formatDataBytes('2048'), '2.0 KB');

// --- formatTransferLimit: a configured cap where 0 means "no limit" ---
assert.equal(formatTransferLimit(0), 'بدون حد');
assert.equal(formatTransferLimit(undefined), 'بدون حد');
assert.equal(formatTransferLimit(null), 'بدون حد');
assert.equal(formatTransferLimit(-1), 'بدون حد');
assert.equal(formatTransferLimit(NaN), 'بدون حد');
assert.equal(formatTransferLimit(2 * 1024 * 1024), '2.0 MB');
assert.equal(formatTransferLimit(4 * 1024 * 1024 * 1024), '4.00 GB');

// A data size of zero and an unlimited cap are presented differently.
assert.notEqual(formatDataBytes(0), formatTransferLimit(0));

// --- formatDuration: H:MM:SS or M:SS, empty when unknown ---
assert.equal(formatDuration(0), '');
assert.equal(formatDuration(undefined), '');
assert.equal(formatDuration(-10), '');
assert.equal(formatDuration(NaN), '');
assert.equal(formatDuration(5), '0:05');
assert.equal(formatDuration(65), '1:05');
assert.equal(formatDuration(3661), '1:01:01');
assert.equal(formatDuration(59.9), '0:59');

console.log('WIVA format tests passed');
