// Generate a stable hardware ID from MAC + CPU + hostname.
// Pure-Node, no native deps. Same machine = same ID across reboots.
const os = require('os');
const crypto = require('crypto');

function getHardwareId() {
  const ifaces = os.networkInterfaces();
  const macs = [];
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.mac && i.mac !== '00:00:00:00:00:00' && !i.internal) macs.push(i.mac);
    }
  }
  macs.sort();
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'unknown';
  const seed = [
    macs.join('|'),
    cpuModel,
    os.arch(),
    os.platform(),
    os.hostname(),
    String(cpus.length),
    String(Math.round((os.totalmem() || 0) / (1024 * 1024 * 1024))),
  ].join('::');
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

module.exports = { getHardwareId };
