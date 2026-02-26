import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Project Browser exposes a master starred print bundle action in Evidence Desk header', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(html, /printStarredBundleButton\.textContent\s*=\s*'Print all starred'/);
  assert.match(html, /printStarredBundleButton\.addEventListener\('click',\s*\(\)\s*=>\s*openMasterFieldBookPrintPreview\(projectContext\.projectFile\)\)/);
  assert.match(html, /function\s+getMasterFieldBookBundleResources\s*\([\s\S]*targetFolderKeys\s*=\s*\['plats',\s*'ros',\s*'cpfs'\]/);
  assert.match(html, /function\s+syncMasterPrintStarredButtonState\s*\(button,\s*projectFile\s*=\s*\{\}\)\s*\{[\s\S]*button\.disabled\s*=\s*!bundleResources\.some/);
  assert.match(html, /async\s+function\s+openMasterFieldBookPrintPreview\s*\([\s\S]*No starred Plats, ROS, or CP&F files were found/);
  assert.match(html, /Print all starred Plats, ROS, and CP&amp;Fs/);
});
