import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PROJECT_BROWSER syncs project plat references from API into plats folder', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+buildProjectPlatApiUrl\(projectId\s*=\s*'',\s*platId\s*=\s*''\)\s*\{[\s\S]*\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/plats/, 'Project Browser should define project plats API URL builder.');
  assert.match(html, /async\s+function\s+syncProjectPlatsFromApi\(projectContext\s*=\s*\{\}\)\s*\{[\s\S]*folder\s*=\s*projectContext\.projectFile\?\.folders\?\.find\(\(entry\) => entry\.key === 'plats'\)/, 'Project Browser should hydrate plats folder resources from project plats API.');
  assert.match(html, /await\s+syncProjectCpfsFromApi\(projectContext\);[\s\S]*await\s+syncProjectRosFromApi\(projectContext\);[\s\S]*await\s+syncProjectPlatsFromApi\(projectContext\);/, 'Project Browser should sync plats API state in project refresh flows.');
});
