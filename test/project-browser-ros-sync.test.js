import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PROJECT_BROWSER syncs project ROS references from API into ros folder', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+buildProjectRosApiUrl\(projectId\s*=\s*'',\s*rosId\s*=\s*''\)\s*\{[\s\S]*\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/ros/, 'Project Browser should define project ROS API URL builder.');
  assert.match(html, /async\s+function\s+syncProjectRosFromApi\(projectContext\s*=\s*\{\}\)\s*\{[\s\S]*folder\s*=\s*projectContext\.projectFile\?\.folders\?\.find\(\(entry\) => entry\.key === 'ros'\)/, 'Project Browser should hydrate ros folder resources from project ROS API.');
  assert.match(html, /await\s+syncProjectCpfsFromApi\(projectContext\);[\s\S]*await\s+syncProjectRosFromApi\(projectContext\);/, 'Project Browser should sync ROS API state after CP&F sync in project refresh flows.');
});
