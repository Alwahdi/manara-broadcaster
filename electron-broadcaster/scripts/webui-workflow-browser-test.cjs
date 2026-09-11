// Requires a built webui/dist and an existing ChromeDriver (WEBDRIVER_URL).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { tmpdir } = require('node:os');

const dist = path.resolve(__dirname, '../webui/dist');
const driver = process.env.WEBDRIVER_URL || 'http://127.0.0.1:9515';
const channels = [
  { id: 1, name: 'Test channel A', enabled: true, url: 'http://example.invalid/a' },
  { id: 2, name: 'Test channel B', enabled: true, url: 'http://example.invalid/b' },
];
let savedSetup;
let settings = {};
let stateRevision = 0;
let failSetup = false;
let viewerStatus = 200;
let failViewerList = false;
let signedIn = false;
let failLogout = false;
let activationState = 'active';
let listRequests = 0;
let favoriteIds = ['11'];
let watchLaterIds = ['12'];
const media = [
  { id: 11, title: 'Favorite fixture', name: 'Favorite fixture', kind: 'video', available: true },
  { id: 12, title: 'Watch later fixture', name: 'Watch later fixture', kind: 'video', available: true },
  { id: 13, title: 'History fixture', name: 'History fixture', kind: 'video', available: true },
];
const viewerState = () => ({
  account: signedIn ? { id: 1, name: 'Fixture viewer', phone: '0000000000' } : null,
  permissions: { manageLibrary: false }, libraryPolicy: { downloadsEnabled: false },
  favorites: media.filter((item) => favoriteIds.includes(String(item.id))), favoriteIds,
  watchLater: media.filter((item) => watchLaterIds.includes(String(item.id))), watchLaterIds,
  history: [{ mediaId: '13', media: media[2], position: 45, duration: 100 }],
});
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
          if (failSetup) return json({ error: 'Save fixture unavailable' }, 503);
          settings = { ...settings, ...savedSetup };
          json({ state: { urls: { adminLocal: `http://127.0.0.1:${server.address().port}/admin/dashboard` } } });
        });
        return;
      }
      if (pathname === '/api/admin/update/check') { stateRevision++; settings.networkName = `Server network ${stateRevision}`; return json({ ok: true }); }
      if (pathname === '/api/viewer/list') {
        listRequests++;
        const parts = [];
        req.on('data', (part) => parts.push(part));
        req.on('end', () => setTimeout(() => {
          if (failViewerList) return json({ error: 'List fixture unavailable' }, 503);
          const body = JSON.parse(Buffer.concat(parts).toString());
          const ids = body.list === 'watchLater' ? watchLaterIds : favoriteIds;
          const next = ids.filter((id) => id !== String(body.mediaId));
          if (body.active) next.push(String(body.mediaId));
          if (body.list === 'watchLater') watchLaterIds = next; else favoriteIds = next;
          json(viewerState());
        }, 150));
        return;
      }
      if (pathname === '/api/viewer/logout') {
        if (failLogout) return json({ error: 'Logout fixture unavailable' }, 503);
        signedIn = false;
        viewerStatus = 503;
        return json({ ok: true });
      }
      if (pathname.endsWith('/import/preview')) return json({ channels });
      return setTimeout(() => json({ error: 'fixture_failure' }, 403), 400);
    }
    if (pathname === '/api/agent/state') return json({
      subscription: { state: activationState }, version: `fixture-${stateRevision}`,
      networkName: settings.networkName || `Test network ${stateRevision}`, brandName: settings.brandName || 'Test brand',
      ports: { live: settings.port || 8787, library: settings.libraryPort || 8788 },
      settings: { adminUsername: 'operator', port: 8787, libraryPort: 8788, ...settings },
    });
    if (pathname === '/api/viewer/state') return json(viewerStatus === 200 ? viewerState() : { error: 'Viewer fixture unavailable' }, viewerStatus);
    if (pathname === '/api/viewer/messages') return json({ messages: [] });
    if (pathname === '/api/library') return json({ items: media });
    if (/^\/api\/media\/\d+$/.test(pathname)) return json(media.find((item) => item.id === Number(pathname.split('/').pop())));
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
    const screenshot = async (name) => {
      const directory = path.join(tmpdir(), 'wiva-ux-browser');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from(await call('GET', '/screenshot'), 'base64'));
    };

    const key = (value) => call('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }] });
    const appLink = (href) => script('document.querySelector(`a[href="${arguments[0]}"]`).click()', href);
    const discard = async () => {
      await click('تجاهل التغييرات');
      await call('POST', '/alert/accept', {});
      await wait('![...document.querySelectorAll("[role=status]")].some(e => e.textContent.includes("تغييرات غير محفوظة"))');
    };

    for (const width of [320, 390, 1366]) {
      settings = {};
      stateRevision = 0;
      viewerStatus = 200;
      favoriteIds = ['11'];
      watchLaterIds = ['12'];
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
      assert.equal(await script('return document.querySelectorAll(".sidebar [aria-current=page]").length'), 1, 'only the most specific navigation destination is current');
      if (width < 980) {
        assert.equal(await script('return document.querySelector(".sidebar").inert'), true);
        await script('document.querySelector(".admin-topbar .menu-toggle").click()');
        await wait('document.querySelector(".sidebar[role=dialog]") && document.activeElement.textContent.includes("إغلاق القائمة")');
        assert.equal(await script('return document.querySelector(".admin-main").inert'), true);
        await screenshot(`admin-drawer-${width}`);
        await call('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [
          { type: 'keyDown', value: '\uE008' }, { type: 'keyDown', value: '\uE004' },
          { type: 'keyUp', value: '\uE004' }, { type: 'keyUp', value: '\uE008' },
        ] }] });
        assert.equal(await script('return document.activeElement.getAttribute("href")'), '/');
        await key('\uE004');
        assert.equal(await script('return document.activeElement.textContent'), 'إغلاق القائمة');
        await key('\uE00C');
        await wait('!document.querySelector(".sidebar[role=dialog]")');
        assert.equal(await script('return document.activeElement === document.querySelector(".admin-topbar .menu-toggle")'), true);
        assert.equal(await script('return document.body.style.overflow'), '');
      }
      await click('فحص كل المصادر');
      await alert();
      await click('إعادة الربط');
      await wait('document.body.innerText.includes("Test disk")');
      assert.equal(await script('return document.querySelector(".explorer-item").tagName'), 'BUTTON');
      await script('[...document.querySelectorAll(".explorer-item")].find(e => e.textContent.includes("Test disk")).focus()');
      await key('\uE007');
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

      await replaceInput('#settings-network', 'مسودة الشبكة');
      await click('التحقق الآن');
      await wait('document.body.innerText.includes("تغيّرت الإعدادات على الخادم")');
      assert.equal(await script('return document.querySelector("#settings-network").value'), 'مسودة الشبكة', 'unrelated update refresh preserves dirty settings');
      await screenshot(`settings-draft-${width}`);
      await appLink('/admin/branding');
      await wait('document.querySelector("#branding-name")?.value === "Test brand"');
      await replaceInput('#branding-name', 'هوية جديدة');
      assert.equal(await script('return document.querySelector("#branding-name").labels.length'), 1);
      await call('POST', '/back', {});
      await wait('document.querySelector("#settings-network")?.value === "مسودة الشبكة"');
      await discard();
      await call('POST', '/forward', {});
      await wait('document.querySelector("#branding-name")?.value === "هوية جديدة"');
      failSetup = true;
      await click('حفظ');
      await wait('document.querySelector("[role=alert]")?.textContent.includes("Save fixture unavailable")');
      assert.equal(await script('return document.querySelector("#branding-name").value'), 'هوية جديدة', 'failed save preserves branding draft');
      failSetup = false;
      await click('حفظ');
      await wait('document.body.innerText.includes("تم الحفظ")');
      await replaceInput('#branding-name', 'مسودة ثانية');
      assert.equal(await script('return document.body.innerText.includes("تم الحفظ")'), false, 'old success is not shown for a new draft');
      await discard();

      await visit('/favorites', 'Favorite fixture');
      assert.equal(await script('return document.querySelector(".topnav a[href=\\"/favorites\\"]") !== null'), true, 'desktop navigation includes My list');
      await script('[...document.querySelectorAll(".collection-filters button")].find(b => b.textContent.includes("المشاهدة لاحقًا")).click()');
      await wait('document.body.innerText.includes("Watch later fixture")');
      await click('إزالة من المشاهدة لاحقًا');
      await wait('document.body.innerText.includes("لا توجد عناصر في المشاهدة لاحقًا")');
      assert.deepEqual(watchLaterIds, []);
      await script('[...document.querySelectorAll(".collection-filters button")].find(b => b.textContent.includes("سجل المشاهدة")).click()');
      await wait('document.body.innerText.includes("History fixture")');
      failViewerList = true;
      const requestsBefore = listRequests;
      await script('document.querySelector(".favorite-button").click()');
      await wait('document.querySelector(".favorite-button").disabled');
      await script('document.querySelector(".favorite-button").click()');
      await wait('document.querySelector(".collection-action-error")');
      assert.equal(listRequests, requestsBefore + 1, 'pending list mutations cannot be submitted twice');
      failViewerList = false;
      await script('document.querySelector(".favorite-button").click()');
      await wait('document.querySelector(".favorite-button").getAttribute("aria-pressed") === "true"');

      await visit('/watch/media/12', 'Watch later fixture');
      await click('إضافة إلى المشاهدة لاحقًا');
      await wait('document.querySelector("button[aria-label=\\"إزالة من المشاهدة لاحقًا\\"]")');
      assert.deepEqual(watchLaterIds, ['12'], 'watch page action updates the same saved collection');
      await script('Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });');
      await click('مشاركة');
      await wait('document.querySelector(".share-fallback input")');
      assert.equal(await script('return document.querySelector(".share-fallback input").value'), `${origin}/watch/media/12`);
      await appLink('/favorites');
      await wait('document.querySelector(".collection-filters")');
      await script('window.retainedCollection = document.querySelector(".collection-filters")');
      viewerStatus = 503;
      await click('تحديث القائمة');
      await wait('document.body.innerText.includes("نعرض آخر بيانات متاحة")');
      assert.equal(await script('return document.querySelector(".collection-filters") === window.retainedCollection'), true, 'transient refresh keeps the mounted collection');
      viewerStatus = 403;
      await click('إعادة المحاولة');
      await wait('document.body.innerText.includes("تعذّر تحميل المحتوى")');
      assert.equal(await script('return document.querySelector(".collection-filters")'), null, 'authorization errors never retain cached content');
      viewerStatus = 200;
      await click('إعادة المحاولة');
      await wait('document.querySelector(".collection-filters")');
      assert.equal(await script('return document.documentElement.scrollWidth <= window.innerWidth + 1'), true, 'saved collections fit the viewport');
      await screenshot(`saved-collections-${width}`);

      await visit('/setup/ports', 'المنافذ والمسارات');
      await replaceInput('#setup-live-port', '-1');
      await wait('document.querySelector("#setup-port-error")');
      assert.equal(await script('return [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "التالي").disabled'), true);
      await replaceInput('#setup-live-port', '٨٧٨٧');
      await wait('!document.querySelector("#setup-port-error")');
      assert.equal(await script('return document.querySelector("#setup-live-port").labels.length'), 1);
      await appLink('/setup/finish');
      await wait('document.body.innerText.includes("إكمال البيانات")');
      assert.equal(await script('return document.querySelectorAll(".setup-steps a").length'), 6);
      assert.equal(await script('return document.querySelector(".setup-steps").textContent.includes("✓")'), false, 'step position does not imply completion');
    }
    signedIn = true;
    await visit('/account', 'Fixture viewer');
    failLogout = true;
    await click('تسجيل الخروج');
    await wait('document.body.innerText.includes("تعذّر تسجيل الخروج")');
    assert.equal(await script('return document.querySelector(".account-card-copy strong").textContent'), 'Fixture viewer');
    failLogout = false;
    await click('تسجيل الخروج');
    await wait('!document.body.innerText.includes("Fixture viewer")');
    await wait('document.body.innerText.includes("تعذّر تحميل المحتوى")');
    assert.equal(await script('return document.querySelector(".account-hero h1").textContent.includes("Fixture viewer")'), false, 'failed post-logout refetch does not restore identity');
    viewerStatus = 200;
    await visit('/setup/network', 'بيانات الشبكة');
    await input('.field input', 'شبكة الاختبار');
    await appLink('/setup/admin-account');
    await wait('document.querySelector("#setup-admin-username")');
    await replaceInput('#setup-admin-username', 'operator');
    await input('#setup-admin-password', 'Fixture-setup-123!');
    assert.equal(await script('return JSON.parse(sessionStorage.getItem("wiva.setup.draft")).adminPassword'), null, 'setup password is not persisted in browser storage');
    await appLink('/setup/finish');
    await wait('document.body.innerText.includes("جاهز للانطلاق")');
    failSetup = true;
    await click('إنهاء الإعداد');
    await wait('document.body.innerText.includes("Save fixture unavailable")');
    failSetup = false;
    await click('إنهاء الإعداد');
    await wait('document.body.innerText.includes("تم حفظ إعداد الشبكة")');
    assert.equal(savedSetup.networkName, 'شبكة الاختبار');
    assert.equal(savedSetup.libraryPath, undefined);
    assert.equal(savedSetup.iptvUrl, undefined);
    assert.equal(await script('return document.querySelector("a.btn-primary").href'), `${origin}/admin/dashboard`, 'completion handoff retains the browser hostname');
    assert.equal(await script('return document.body.innerText.includes("لم تُضف مصادر أو قنوات بعد")'), true);

    activationState = 'pending';
    await visit('/', 'تحديث الحالة');
    await click('تحديث الحالة');
    assert.equal(await script('return [...document.querySelectorAll("button")].find(b => b.textContent.includes("جارٍ التحقق")).disabled'), true);
    await wait('document.body.innerText.includes("تعذّر تحديث حالة التفعيل")');
    activationState = 'active';
    await visit('/setup/admin-account?recovery=1', 'إعادة تعيين دخول المشرف');
    await wait('document.querySelector("input[type=password]") && !document.querySelector("input[type=password]").disabled');
    await input('input[type=password]', 'New-password-123!');
    assert.equal(await script('return document.querySelector("input[type=password]").value'), 'New-password-123!');
    await click('حفظ كلمة المرور الجديدة');
    await wait('location.pathname === "/admin/dashboard"');
    assert.equal(await script('return location.hostname'), 'localhost', 'loopback server URL does not replace the browser hostname');
    assert.equal(savedSetup.adminRecovery, true);
    assert.equal(savedSetup.adminPassword, 'New-password-123!');
    console.log('WIVA workflow browser checks passed (320px/390px/1366px, drawer keyboard focus, storage keyboard access, dirty drafts, saved collections, transient/permission failures, logout, setup handoff, Arabic ports and recovery)');
  } finally {
    if (session) await command('DELETE', `/session/${session}`).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
