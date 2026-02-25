import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const recordQuarryPath = new URL('../RecordQuarry.html', import.meta.url);
const browserClientPath = new URL('../src/browser-survey-client.js', import.meta.url);

test('RecordQuarry starts utility lookup in background with a timeout', async () => {
  const html = await readFile(recordQuarryPath, 'utf8');

  assert.match(html, /const\s+UTILITY_LOOKUP_TIMEOUT_MS\s*=\s*4500\s*;/, 'RecordQuarry should enforce a utility lookup timeout to avoid long blocked UI waits.');
  assert.match(html, /const\s+utilityLookupPromise\s*=\s*loadUtilitiesByAddress\(rawAddr,\s*\{[\s\S]*timeoutMs:\s*UTILITY_LOOKUP_TIMEOUT_MS,[\s\S]*\}\)/, 'RecordQuarry should request utilities with an explicit timeout value.');
  assert.doesNotMatch(html, /await\s+loadUtilitiesByAddress\(rawAddr,\s*\{[\s\S]*sources:\s*\['power'\]/, 'RecordQuarry should no longer await utility lookup before rendering cards.');
  assert.match(html, /utilityLookupPromise\.then\(\(\{ utilityLocations, error \}\) => \{/, 'RecordQuarry should apply utility results asynchronously after initial UI render.');
});

test('browser survey client supports requestJson timeouts for utility lookups', async () => {
  const source = await readFile(browserClientPath, 'utf8');

  assert.match(source, /const\s+timeoutMs\s*=\s*Number\(options\.timeoutMs\);/, 'requestJson should parse timeoutMs from options.');
  assert.match(source, /if \(controller\) fetchOptions\.signal = controller\.signal;/, 'requestJson should wire AbortController signal into fetch options.');
  assert.match(source, /if \(controller\?\.signal\.aborted\) \{[\s\S]*Request timed out\./, 'requestJson should surface timeout failures as explicit errors.');
  assert.match(source, /requestJson\('\/api\/utilities',[\s\S]*\},\s*\{[\s\S]*timeoutMs:\s*options\.timeoutMs,[\s\S]*\}\);/, 'loadUtilitiesByAddress should pass timeoutMs through to requestJson.');
});
