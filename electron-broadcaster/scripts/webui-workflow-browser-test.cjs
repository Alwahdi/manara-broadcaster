// Requires a built webui/dist and an existing ChromeDriver (WEBDRIVER_URL).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const dist = path.resolve(__dirname, '../webui/dist');
const driver = process.env.WEBDRIVER_URL || 'http://127.0.0.1:9515';
const channels = [
  { id: 1, name: 'Test channel A', enabled: true, url: 'http://example.invalid/a' },
  { id: 2, name: 'Test channel B', enabled: true, url: 'http://example.invalid/b' },
];
let savedSetup;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (pathname.startsWith('/api/')) {
    if (req.method !== 'GET') {
      if (pathname === '/api/setup/save') {
        const parts = [];
        req.on('data', (part) => parts.push(part));
        req.on('end', () => {
          savedSetup = JSON.parse(Buffer.concat(parts).toString());
          json({ state: { urls: { adminLocal: `http://127.0.0.1:${server.address().port}/admin/dashboard` } } });
        });
        return;
      }
      if (pathname.endsWith('/import/preview')) return json({ channels });
      return setTimeout(() => json({ error: 'fixture_failure' }, 403), 400);
    }
    if (pathname === '/api/agent/state') return json({ subscription: { state: 'active' }, ports: { live: 8787, library: 8788 }, settings: { adminUsername: 'operator', port: 8787, libraryPort: 8788 } });
    if (pathname === '/api/admin/state') return json({ broadcast: channels, iptv: channels, cloudIptv: [] });
    if (pathname === '/api/admin/messages') return json({ messages: [{ id: 1, name: 'Test viewer', message: 'Test message', status: 'new' }] });
    if (pathname === '/api/admin/library/sources') return json({ sources: [{ id: 1, label: 'Test source', path: '/test-media', online: true }] });
    if (pathname === '/api/admin/library/scan-status') return json({ status: { active: false, state: 'idle' } });
    if (pathname === '/api/admin/library/policy') return json({ policy: { downloadsEnabled: true } });
    if (pathname === '/api/admin/storage/roots') return json({ roots: [{ path: '/test-media', label: 'Test disk' }] });
    if (pathname === '/api/admin/storage/browse') return json({ entries: [] });
    return json({});
  }
  const file = path.resolve(dist, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) {
    res.writeHead(403);
    return res.end();
  }
  const asset = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  res.writeHead(200, { 'Content-Type': types[path.extname(asset)] || 'application/octet-stream' });
  fs.createReadStream(asset).pipe(res);
});

async function main() {
  assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'Build webui before running browser checks');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://localhost:${server.address().port}`;
  let session;
  const command = async (method, route, body) => {
    const response = await fetch(`${driver}${route}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result));
    return result.value;
  };
  try {
    session = (await command('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'chrome', 'goog:chromeOptions': { args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] } } } })).sessionId;
    const call = (method, route, body) => command(method, `/session/${session}${route}`, body);
    const script = (source, ...args) => call('POST', '/execute/sync', { script: source, args });
    const wait = async (source) => {
      for (let i = 0; i < 80; i++) {
        if (await script(`return Boolean(${source})`)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Browser condition timed out: ${source}\n${await script('return document.body.innerText')}`);
    };
    const visit = async (route, text) => {
      await call('POST', '/url', { url: `${origin}${route}` });
      await wait(`document.body.innerText.includes(${JSON.stringify(text)})`);
    };
    const click = (text, index = 0) => script('const buttons = [...document.querySelectorAll("button")].filter(b => b.textContent.trim() === arguments[0]); if (!buttons[arguments[1]]) throw Error("Missing button: " + arguments[0]); buttons[arguments[1]].click();', text, index);
    const input = async (selector, value) => {
      const element = await call('POST', '/element', { using: 'css selector', value: selector });
      await call('POST', `/element/${element['element-6066-11e4-a52e-4f735466cecf']}/value`, { text: value });
    };
    const replaceInput = async (selector, value) => {
      const element = await call('POST', '/element', { using: 'css selector', value: selector });
      await call('POST', `/element/${element['element-6066-11e4-a52e-4f735466cecf']}/clear`, {});
      await input(selector, value);
    };
    const alert = () => wait('document.querySelector("[role=alert]")?.textContent.includes("تعذّر")');

    for (const width of [390, 1366]) {
      await call('POST', '/window/rect', { width, height: 900 });
      await visit('/admin/channels', 'Test channel B');
      await click('تعديل', 0);
      await click('تعديل', 1);
      assert.equal(await script('return document.querySelector(".field input").value'), 'Test channel B');
      await click('حفظ التعديل');
      assert.equal(await script('return [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "إلغاء").disabled'), true);
      await alert();
      assert.equal(await script('return document.querySelector(".field input").value'), 'Test channel B');
      assert.equal(await script('return document.documentElement.dir'), 'rtl');
      assert.equal(await script('return document.documentElement.scrollWidth <= window.innerWidth + 1'), true, 'admin layout fits the viewport');

      await visit('/admin/iptv', 'Test channel B');
      await click('تعديل', 0);
      await click('تعديل', 1);
      assert.equal(await script('return document.querySelector(".field input").value'), 'Test channel B');
      await click('حفظ التعديل');
      await alert();

      await visit('/admin/messages', 'Test message');
      await click('تحديد كمقروءة');
      await alert();

      await visit('/admin/iptv/import', 'معاينة القنوات');
      await input('input', 'http://example.invalid/playlist.m3u');
      await click('معاينة القنوات');
      await wait('document.body.innerText.includes("Test channel B")');
      await click('إضافة 2');
      assert.equal(await script('return [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "معاينة القنوات").disabled'), true);
      await alert();

      await visit('/admin/library/sources', 'Test source');
      await click('فحص كل المصادر');
      await alert();
      await click('إعادة الربط');
      await wait('document.body.innerText.includes("Test disk")');
      await script('[...document.querySelectorAll(".explorer-item")].find(e => e.textContent.includes("Test disk")).click()');
      await wait('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "إعادة الربط بهذا المجلد")');
      await click('إعادة الربط بهذا المجلد');
      assert.equal(await script('return [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "جارٍ الحفظ…").disabled'), true);
      await alert();

      await visit('/admin/settings', 'حفظ الإعدادات');
      await wait('document.querySelector("#settings-port")?.value === "8787"');
      await replaceInput('#settings-port', '65536');
      await wait('document.querySelector("#settings-port-error")');
      assert.equal(await script('return document.querySelector("button[type=submit]").disabled'), true);
      await replaceInput('#settings-port', '٨٠٨٠');
      await replaceInput('#settings-library-port', '۸۴۲۰');
      assert.equal(await script('return document.querySelector("#settings-port").labels.length'), 1);
      await call('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE007' }, { type: 'keyUp', value: '\uE007' }] }] });
      await wait('document.body.innerText.includes("تم الحفظ")');
      assert.equal(savedSetup.port, 8080, 'Arabic port survives Enter submission');
      assert.equal(savedSetup.libraryPort, 8420, 'Persian port survives Enter submission');

      await visit('/setup/ports', 'المنافذ والمسارات');
      await replaceInput('#setup-live-port', '-1');
      await wait('document.querySelector("#setup-port-error")');
      assert.equal(await script('return [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "التالي").disabled'), true);
      await replaceInput('#setup-live-port', '٨٧٨٧');
      await wait('!document.querySelector("#setup-port-error")');
      assert.equal(await script('return document.querySelector("#setup-live-port").labels.length'), 1);
    }
    await visit('/setup/admin-account?recovery=1', 'إعادة تعيين دخول المشرف');
    await wait('document.querySelector("input[type=password]") && !document.querySelector("input[type=password]").disabled');
    await input('input[type=password]', 'New-password-123!');
    assert.equal(await script('return document.querySelector("input[type=password]").value'), 'New-password-123!');
    await click('حفظ كلمة المرور الجديدة');
    await wait('location.pathname === "/admin/dashboard"');
    assert.equal(await script('return location.hostname'), 'localhost', 'loopback server URL does not replace the browser hostname');
    assert.equal(savedSetup.adminRecovery, true);
    assert.equal(savedSetup.adminPassword, 'New-password-123!');
    console.log('WIVA workflow browser checks passed (390px/1366px, mutation failures, editor switching, Arabic ports, keyboard submit, recovery and redirect)');
  } finally {
    if (session) await command('DELETE', `/session/${session}`).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
