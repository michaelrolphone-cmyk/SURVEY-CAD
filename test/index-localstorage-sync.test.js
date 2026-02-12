import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const launcherHtmlPath = path.resolve(__dirname, '..', 'index.html');

async function loadLauncherHtml() {
  return readFile(launcherHtmlPath, 'utf8');
}

test('launcher localStorage sync uses a single-flight poller instead of setInterval overlap', async () => {
  const html = await loadLauncherHtml();

  assert.match(html, /let\s+localStorageSyncInFlight\s*=\s*false\s*;/, 'should track whether a sync request is already running');
  assert.match(html, /if\s*\(localStorageSyncInFlight\)\s*\{[\s\S]*return\s*;[\s\S]*\}/, 'should bail out when another sync is in flight');
  assert.doesNotMatch(html, /setInterval\s*\(\s*\(\)\s*=>\s*\{[\s\S]*syncLocalStorageWithServer\(/, 'should no longer fire syncs on fixed interval regardless of in-flight requests');
});

test('launcher localStorage sync backs off after failures and re-queues forced sync requests', async () => {
  const html = await loadLauncherHtml();

  assert.match(html, /LOCAL_STORAGE_SYNC_MAX_RETRY_MS\s*=\s*30000/, 'should cap retry delay to avoid unbounded backoff');
  assert.match(html, /localStorageSyncPollDelayMs\s*=\s*Math\.min\(localStorageSyncPollDelayMs\s*\*\s*2,\s*LOCAL_STORAGE_SYNC_MAX_RETRY_MS\)/, 'should exponentially back off on failures');
  assert.match(html, /if\s*\(localStorageSyncForceQueued\)\s*\{[\s\S]*queueLocalStorageSyncPoll\(0\);/, 'should immediately process forced syncs queued during an in-flight request');
});
