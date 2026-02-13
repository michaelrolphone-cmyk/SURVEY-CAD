import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const launcherHtmlPath = path.resolve(__dirname, '..', 'index.html');
const browserSyncModulePath = path.resolve(__dirname, '..', 'src', 'browser-localstorage-sync.js');

async function loadLauncherHtml() {
  return readFile(launcherHtmlPath, 'utf8');
}

test('launcher loads websocket-based localStorage sync module', async () => {
  const html = await loadLauncherHtml();

  assert.match(html, /<script type="module" src="\/src\/browser-localstorage-sync\.js"><\/script>/, 'launcher should load the shared browser localStorage sync module');
  assert.doesNotMatch(html, /setInterval\(/, 'launcher should not use polling interval localStorage sync loops');
});

test('browser localStorage sync module patches localStorage and queues offline differentials', async () => {
  const source = await readFile(browserSyncModulePath, 'utf8');

  assert.match(source, /storageProto\.setItem\s*=\s*function patchedSetItem/, 'sync module should wrap localStorage.setItem writes');
  assert.match(source, /storageProto\.removeItem\s*=\s*function patchedRemoveItem/, 'sync module should wrap localStorage.removeItem writes');
  assert.match(source, /if \(!navigator\.onLine\) return;/, 'sync module should defer sync while offline');
  assert.match(source, /surveyfoundryLocalStoragePendingDiffs/, 'sync module should persist pending differentials locally while offline');
  assert.match(source, /type:\s*'sync-differential'/, 'sync module should send differential websocket messages');
  assert.match(source, /baseChecksum:\s*next\.baseChecksum/, 'sync module should replay queued differentials with their original base checksums');
  assert.match(source, /#rebasePendingQueue\(serverSnapshot = \{\}, localSnapshotOverride = null\)/, 'sync module should rebase queued differentials onto server state after mismatch');
  assert.match(source, /fetch\('\/api\/localstorage-sync'\)/, 'sync module should fall back to server API snapshot fetch for checksum recovery');
  assert.match(source, /MAX_PRECONNECT_FAILURES_BEFORE_DORMANT/, 'sync module should reduce repeated websocket-failed reconnect spam before first successful connection');
  assert.match(source, /shouldRunHttpFallbackSync/, 'sync module should enable low-frequency HTTP fallback sync when websocket transport is unavailable');
  assert.match(source, /method:\s*'POST'/, 'sync module should publish queued local changes through POST \/api\/localstorage-sync while websocket transport is unavailable');
});
