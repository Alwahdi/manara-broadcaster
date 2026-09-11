const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const controls = read('webui/src/components/WivaPlayerControls.tsx');
const frame = read('webui/src/components/WivaMediaPlayer.tsx');
const live = read('webui/src/screens/viewer/WatchChannel.tsx');
const media = read('webui/src/screens/viewer/WatchMedia.tsx');
const styles = read('webui/src/styles/layouts.css');
const viewerUtils = read('webui/src/screens/viewer/viewer-utils.ts');
const viewerLayout = read('webui/src/components/ViewerLayout.tsx');
const libraryFolders = read('webui/src/screens/viewer/LibraryFolders.tsx');
const adminLibrary = read('webui/src/screens/admin/LibrarySources.tsx');
const broadcaster = read('server/broadcaster.html');
const appShell = read('main.cjs');
const common = read('webui/src/components/common.tsx');
const mediaServer = read('library/media-server.cjs');
const wivaApp = read('webui/src/components/WivaApp.tsx');
const account = read('webui/src/screens/viewer/Account.tsx');
const layout = read('webui/src/app/layout.tsx');
const manifest = read('webui/src/app/manifest.ts');
const pwaInstall = read('webui/src/components/PwaInstallCard.tsx');
const states = read('webui/src/components/States.tsx');
const recovery = read('webui/src/screens/setup/AdminAccount.tsx');
const finish = read('webui/src/screens/setup/Finish.tsx');
const channelsAdmin = read('webui/src/screens/admin/Channels.tsx');
const iptvAdmin = read('webui/src/screens/admin/Iptv.tsx');
const iptvImport = read('webui/src/screens/admin/IptvImport.tsx');
const messagesAdmin = read('webui/src/screens/admin/Messages.tsx');
const storageBrowser = read('webui/src/components/StorageBrowser.tsx');

const redirectSource = require('node:module').stripTypeScriptTypes(read('webui/src/lib/setupRedirect.ts'));
const setupAdminUrl = require('node:vm').runInNewContext(
  `${redirectSource.replace('export function', 'function')}\nsetupAdminUrl`,
  { URL },
);
for (const [returnedUrl, browserUrl, expected] of [
  ['http://127.0.0.1:9000/admin', 'http://192.168.1.25:8788/setup/finish', 'http://192.168.1.25:9000/admin'],
  ['http://127.0.0.1:8787/ops/admin', 'http://wiva.local:8788/setup/finish', 'http://wiva.local:8787/ops/admin'],
  ['http://127.0.0.1:8788/admin', 'http://localhost:8788/setup/admin?recovery=1', 'http://localhost:8788/admin'],
  ['http://127.0.0.1:9000/admin', 'http://[fd00::25]:8788/setup/finish', 'http://[fd00::25]:9000/admin'],
  ['http://127.0.0.1:9000/admin', 'https://wiva.local:8788/setup/finish', 'https://wiva.local:9000/admin'],
  [undefined, 'http://wiva.local:8788/setup/finish', 'http://wiva.local:8788/admin/dashboard'],
  ['http://[invalid', 'http://wiva.local:8788/setup/finish', 'http://wiva.local:8788/admin/dashboard'],
  ['javascript:alert(1)', 'http://wiva.local:8788/setup/finish', 'http://wiva.local:8788/admin/dashboard'],
]) {
  assert.equal(setupAdminUrl(returnedUrl, browserUrl), expected, 'setup keeps the browser host and adopts the saved server port/path');
}
for (const screen of [finish, recovery]) {
  assert.match(screen, /setupAdminUrl\(res\.state\?\.urls\?\.adminLocal, window\.location\.href\)/);
}

// Execute the actual recovery initialization effect across loading, typing and refetches.
const recoveryEffect = recovery.match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[/)?.[1];
assert.ok(recoveryEffect);
const runRecoveryEffect = new Function('recoveryMode', 'recoveryState', 'recoveryInitialized', 'data', 'setSetup', recoveryEffect);
const initialized = { current: false };
let draft = { adminUsername: 'old', adminPassword: 'old-draft' };
const setDraft = (patch) => { draft = { ...draft, ...patch }; };
runRecoveryEffect(true, { isSuccess: false }, initialized, draft, setDraft);
assert.equal(initialized.current, false, 'recovery waits for the saved username');
const loadedRecovery = { isSuccess: true, data: { settings: { adminUsername: 'operator' } } };
runRecoveryEffect(true, loadedRecovery, initialized, draft, setDraft);
assert.deepEqual(draft, { adminUsername: 'operator', adminPassword: '' });
draft.adminPassword = 'New-password-123!';
runRecoveryEffect(true, loadedRecovery, initialized, draft, setDraft);
assert.equal(draft.adminPassword, 'New-password-123!', 'typing and query refetches do not erase the new recovery password');

assert.match(states, /function MutationError[\s\S]*?role="alert"/);
assert.match(states, /mutation\.error\.status === 401/);
for (const [screen, mutations] of [
  [channelsAdmin, ['update', 'remove', 'toggle']],
  [iptvAdmin, ['update', 'remove', 'toggle', 'savePolicy']],
  [iptvImport, ['preview', 'commit']],
  [messagesAdmin, ['updateStatus']],
  [adminLibrary, ['rescan', 'scanAll', 'cancelScan', 'relink', 'add', 'removeSource', 'addExclude', 'removeExclude', 'updateSource', 'updatePolicy']],
]) {
  for (const mutation of mutations) assert.ok(screen.includes(`<MutationError mutation={${mutation}}`), `${mutation} failure remains visible and actionable`);
}
for (const screen of [channelsAdmin, iptvAdmin]) {
  assert.match(screen, /key=\{String\(editing\.id\)\}/, 'switching channel editors resets the form to the selected channel');
  assert.match(screen, /disabled=\{busy\} onClick=\{onCancel\}/, 'pending saves cannot close the editor');
}
assert.match(iptvImport, /disabled=\{commit\.isPending \|\| preview\.isPending/, 'a new preview cannot discard a pending import');
assert.match(storageBrowser, /disabled=\{busy\} onClick=\{\(\) => onSelect\(path\)\}/, 'storage selections cannot repeat while saving');
assert.match(adminLibrary, /busy=\{relink\.isPending\}/);
assert.match(adminLibrary, /busy=\{addExclude\.isPending\}/);
assert.match(media, /mediaProgress[\s\S]*?\.then\(\(\) => queryClient\.invalidateQueries\(\{ queryKey: \["viewer-state"\], refetchType: "none" \}\)\)/, 'successful progress invalidates history without polling viewer state during playback');
assert.match(media, /onEnded:[\s\S]*?saveProgress\([^;]*true\)/, 'completion also invalidates viewer history');

assert.doesNotMatch(live, /PlayerFitToolbar|live-player-video-(?:fit|fill|zoom)/);
assert.doesNotMatch(media, /MediaFitToolbar|media-player-video-(?:fit|fill|zoom)/);
assert.doesNotMatch(`${live}\n${media}`, />\s*(?:كامل|ملء|تقريب)\s*</);
assert.match(frame, /mode:\s*"live"\s*\|\s*"vod"/);
assert.match(frame, /is-blocked/);
assert.match(styles, /\.wiva-player\.is-blocked \.wiva-player-controls/);
assert.match(styles, /\.wiva-player\s*\{[\s\S]*?aspect-ratio:\s*16\s*\/\s*9/);
assert.match(styles, /\.wiva-player[\s\S]*?object-fit:\s*contain/);
assert.match(styles, /\.wiva-player:fullscreen[\s\S]*?width:\s*100vw\s*!important/);
assert.match(styles, /\.wiva-player:fullscreen[\s\S]*?height:\s*100vh\s*!important/);
assert.match(styles, /\.wiva-player\[data-rotation="90"\][\s\S]*?width:\s*100dvh/, 'rotated mobile video uses swapped viewport dimensions');
assert.match(styles, /body\.wiva-player-fullscreen-open main[\s\S]*?transform:\s*none\s*!important/, 'pseudo fullscreen escapes page transition containment');
assert.match(styles, /body\.wiva-player-fullscreen-open main[\s\S]*?animation:\s*none\s*!important/, 'pseudo fullscreen disables the page transition containing block');
assert.match(styles, /body\.wiva-player-fullscreen-open \.player-stage[\s\S]*?isolation:\s*auto/, 'pseudo fullscreen rises above viewer navigation');
assert.match(controls, /requestFullscreen/);
assert.match(controls, /RotateCw/);
assert.match(controls, /orientation\.lock\("landscape"\)/, 'mobile fullscreen attempts native landscape orientation');
assert.match(controls, /is-pseudo-fullscreen/, 'mobile player retains custom controls when native fullscreen is unavailable');
assert.match(controls, /applyRotation\(90\)/, 'mobile player has a CSS rotation fallback');
assert.match(controls, /dblclick/);
assert.match(controls, /key === "f"/);
assert.match(controls, /pictureInPictureEnabled/);
assert.match(controls, /wiva-player-volume/);
assert.match(controls, /setTimeout\([\s\S]*?3000/);
assert.match(controls, /\(hover: hover\) and \(pointer: fine\)/);
assert.match(controls, /if \(controlsVisibleRef\.current && !video\.paused\)[\s\S]*?setControlsVisible\(false\)[\s\S]*?else revealControls\(\)/, 'a player tap toggles controls while playback is active');
assert.doesNotMatch(controls, /addEventListener\("pointerdown",\s*onInteraction/, 'touch input does not reveal controls before the tap toggle runs');
assert.match(controls, /const onPause = \(\) => revealControls\(true\)/, 'paused playback keeps controls and the centered play action visible');
assert.match(controls, /!playing \? \([\s\S]*?wiva-player-center-play/, 'the centered play action appears only while playback is paused');
assert.match(controls, /video\.muted = false/);
assert.match(controls, /video\.currentTime[\s\S]*?side \* 10/);
assert.match(controls, /wiva-player-seek-feedback/);
assert.doesNotMatch(controls, /getItem\("wiva-player-muted"\)/);
assert.match(controls, /usesFinePointer[\s\S]*?\(hover: hover\) and \(pointer: fine\)/, 'hover movement reveals controls only for fine pointers');
assert.match(viewerUtils, /Mux\\s\+HLS\\s\+Test/i);
assert.match(viewerUtils, /تلقائية/);
assert.match(live, /15_000/);
assert.match(live, /استغرق تشغيل البث وقتًا أطول من المعتاد/);
assert.match(live, /MANIFEST_PARSED[\s\S]*?media\.play\(\)/);
assert.match(live, /function markPlaying\(\)[\s\S]*?clearTimeout\(recoveryTimer\)[\s\S]*?setStarted\(true\)/);
assert.match(live, /function handlePlayError\(playError: unknown\)/, 'autoplay denials use a shared recovery handler');
assert.match(live, /handlePlayError\(playError\)/, 'native and HLS playback both reuse the autoplay recovery handler');
assert.match(live, /setStatus\("اضغط زر التشغيل لبدء المشاهدة\."\)/, 'autoplay denials tell the viewer to press play');
assert.match(live, /startLevel:\s*0/);
assert.match(live, /capLevelToPlayerSize:\s*true/);
assert.match(live, /abrEwmaDefaultEstimate:\s*500_000/);
assert.match(live, /abrEwmaSlowLive:\s*18/, 'IPTV automatic quality uses a stable long bandwidth estimate');
assert.match(live, /abrBandWidthUpFactor:\s*0\.6/, 'IPTV automatic quality upgrades conservatively to avoid oscillation');
assert.match(live, /lowLatencyMode:\s*false/, 'ordinary IPTV uses a resilience-first HLS buffer');
assert.match(live, /maxBufferLength:\s*45/, 'IPTV keeps enough forward buffer to absorb provider jitter');
assert.match(live, /maxBufferHole:\s*0\.75/, 'small IPTV timestamp gaps do not stall playback');
assert.match(live, /startLoad\?\.\(-1\)/, 'IPTV playback restarts loading after a sustained stall');
assert.match(live, /hlsScriptPromise\s*=\s*null[\s\S]*?throw error/, 'HLS player asset can recover after an initial load failure');
assert.match(live, /manifestLoadingTimeOut:\s*12000/, 'IPTV manifest loading fails clearly instead of waiting indefinitely');
assert.match(live, /fragLoadingMaxRetry:\s*6/, 'IPTV segment retries remain bounded but tolerate brief provider loss');
assert.match(media, /position\s*-\s*10/, 'resume starts ten seconds before the saved position');
assert.match(media, /kind="subtitles"/, 'media player renders external subtitle tracks');
assert.match(media, /item\.kind === "image"/, 'watch media renders a dedicated image viewer');
assert.match(media, /className="image-viewer media-player-shell"/, 'image media uses the polished viewer shell');
assert.match(media, /RISKY_BROWSER_MEDIA_FORMATS/, 'media player warns about browser-hostile legacy formats');
assert.match(media, /\?download=1/, 'viewer download actions use the controlled download endpoint');
assert.doesNotMatch(viewerLayout, /to:\s*["']\/search["']/, 'search is not duplicated in desktop or mobile navigation');
assert.match(viewerLayout, /primary-destination/, 'mobile navigation highlights live as the primary destination');
assert.match(viewerLayout, /Heart, Home, Library, Radio, Search, UserRound/, 'viewer navigation uses the shared Lucide icon language');
assert.match(styles, /\.mobile-bottom-nav[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/, 'mobile navigation uses five Cloud-aligned destinations');
assert.match(styles, /@media \(max-width:\s*430px\)[\s\S]*?\.library-page \.folder-grid,[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, 'phone library keeps the Cloud two-column catalog layout');
assert.match(styles, /\.library-page \.folder-card-art\s*\{[\s\S]*?aspect-ratio:\s*2\s*\/\s*3/, 'phone library uses Cloud-style portrait artwork');
assert.match(styles, /\.image-viewer\s*\{[\s\S]*?place-items:\s*center/, 'image media has a centered standalone viewer');
assert.doesNotMatch(styles, /wiva-player:not\(\.is-blocked\) \.wiva-player-controls\.is-hidden[\s\S]{0,180}opacity:\s*1/, 'mobile CSS allows playing controls to hide');
assert.match(libraryFolders, /permissions\?\.manageLibrary/, 'folder upload controls require an authenticated admin session');
assert.match(libraryFolders, /LIBRARY_UPLOAD_ACCEPT[\s\S]*?\.pdf", ".epub/, 'admin folder uploads include books and documents');
assert.match(libraryFolders, /LIBRARY_UPLOAD_ACCEPT[\s\S]*?\.wmv/, 'folder uploads include legacy Windows video files');
assert.match(libraryFolders, /LIBRARY_UPLOAD_ACCEPT[\s\S]*?\.ass/, 'folder uploads include ASS subtitle companions');
assert.match(common, /image:\s*"صورة"/, 'library labels describe image media in Arabic');
assert.match(mediaServer, /function assToVtt\(text\)/, 'runtime converts ASS subtitles to VTT');
assert.match(mediaServer, /kind === 'image' && isArtworkCompanionFile\(fileName\)/, 'artwork-style image uploads remain companions');
assert.match(adminLibrary, /updateLibraryPolicy/, 'library download policy is managed from the admin dashboard');
assert.match(adminLibrary, /فتح واجهة الرفع/, 'admin library settings expose a direct route to the uploader');
assert.doesNotMatch(broadcaster, /track\.onmute\s*=\s*\(\)\s*=>\s*scheduleAudioRestart/, 'transient HDMI mute does not restart capture');
assert.doesNotMatch(broadcaster, /track\.enabled\s*!==\s*false\s*&&\s*!track\.muted/, 'live HDMI audio remains healthy during transient mute');
assert.match(broadcaster, /AUDIO_MISSING_RESTART_MS\s*=\s*20000/, 'missing capture audio uses a sustained grace period');
assert.match(broadcaster, /AUDIO_STALL_RESTART_MS\s*=\s*20000/, 'persistently muted HDMI audio recovers after a sustained grace period');
assert.match(broadcaster, /navigator\.hardwareConcurrency/, 'capture load protection adapts to the Windows host hardware');
assert.match(broadcaster, /CAPTURE_CAPACITY\.heavyAt/, 'capture sender load uses a hardware-aware heavy-viewer threshold');
assert.match(broadcaster, /CAPTURE_CAPACITY\.crowdedRecoveryAt/, 'capture capacity uses a lower recovery threshold to prevent quality oscillation');
assert.match(broadcaster, /scheduleCapacityRetune\(\)/, 'capture senders are retuned when viewer load changes');
assert.match(broadcaster, /mode === '1080' \? 6000/, '1080p capture stays within a LAN-safe bitrate ceiling');
assert.match(broadcaster, /}, 22000\);/, 'capture sender tolerates a transient ICE disconnect before closing a peer');
assert.match(live, /pcRef\.current\s*!==\s*pc/, 'stale WebRTC peer events cannot trigger reconnect loops');
assert.doesNotMatch(live, /track\.onmute[\s\S]{0,240}scheduleReconnect/, 'viewer does not rebuild video for a transient audio mute');
assert.match(live, /function waitForBroadcasterRecovery\(\)/, 'viewer waits in place while a capture broadcaster recovers');
assert.match(live, /msg\.type === "broadcaster-left"[\s\S]{0,160}waitForBroadcasterRecovery\(\)/, 'broadcaster restart does not discard the registered viewer');
assert.match(live, /}, 20_000\);/, 'viewer tolerates transient LAN and broadcaster interruptions');
assert.match(live, /weakQualitySamples\s*>=\s*2/, 'automatic capture quality requires repeated weak samples before degrading');
assert.match(live, /stableQualitySamples\s*>=\s*6/, 'automatic capture quality waits for sustained stability before upgrading');
assert.match(live, /framesDropped/, 'automatic capture quality observes decoder frame drops');
assert.match(live, /freezeCount/, 'automatic capture quality observes playback freezes');
assert.match(live, /jitterBufferTarget/, 'capture playback keeps a small jitter safety buffer');
assert.match(live, /playoutDelayHint/, 'capture playback asks the browser for stable playout timing');
assert.match(live, /45_000/, 'automatic capture quality has a recovery cooldown');
assert.match(appShell, /show:\s*false[\s\S]*?ready-to-show/, 'agent window stays hidden until its renderer is ready');
assert.match(appShell, /recoverBroadcaster[\s\S]*?render-process-gone/, 'capture renderer crashes recover without restarting WIVA');
assert.match(appShell, /deviceKey:\s*stableDesktopSourceId\(source\.id\)/, 'capture device listings preserve a stable screen or window key');
assert.match(appShell, /stableDesktopSourceId\(source\.deviceKey \|\| rawId\)/, 'saved capture channels normalize screen and window ids before launch');
assert.match(wivaApp, /import \{ Live \} from "@\/screens\/viewer\/Live"/, 'primary live route is included in the initial viewer bundle');
assert.match(account, /PwaInstallCard/, 'viewer account surface exposes app installation affordances');
assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/, 'web UI advertises a manifest for installability');
assert.match(manifest, /display:\s*"standalone"/, 'web UI manifest enables standalone launch');
assert.match(pwaInstall, /serviceWorker\.register\("\/sw\.js"\)/, 'viewer registers a service worker for PWA installability');
assert.match(pwaInstall, /beforeinstallprompt/, 'viewer reacts to browser install prompts');

console.log('WIVA unified player UI tests passed');
