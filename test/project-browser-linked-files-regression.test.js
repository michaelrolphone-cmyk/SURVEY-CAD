import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Project Browser linked-file rows avoid illegal continue and only bind open handlers with URLs', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(html, /if \(downloadUrl\) \{[\s\S]*resource\.classList\.add\('pointforge-openable'\)/, 'linked-file rows should only become openable when a download URL is present');
  assert.doesNotMatch(html, /if \(!downloadUrl\) continue;/, 'linked-file row builder must not use continue outside an iteration statement');
});
