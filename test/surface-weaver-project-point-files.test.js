import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('SURFACE.html can load project point files for an active project', async () => {
  const html = await readFile(path.resolve(__dirname, '../SURFACE.html'), 'utf8');

  assert.match(html, /id="projectPointFile"/, 'Surface Weaver should render a project point-file selector');
  assert.match(html, /id="btnLoadProjectPointFile"/, 'Surface Weaver should render an explicit load button for selected project point files');
  assert.match(html, /const\s+activeProjectId\s*=\s*String\(pageParams\.get\("activeProjectId"\)\s*\|\|\s*pageParams\.get\("projectId"\)\s*\|\|\s*""\)\.trim\(\);/, 'Surface Weaver should resolve active project id from query params');
  assert.match(html, /function\s+buildProjectPointFileApiUrl\(projectId\s*=\s*"",\s*pointFileId\s*=\s*""\)/, 'Surface Weaver should define a project point-file API URL helper');
  assert.match(html, /await\s+fetch\(buildProjectPointFileApiUrl\(activeProjectId\)\)/, 'Surface Weaver should fetch project point file lists from the project API');
  assert.match(html, /await\s+fetch\(buildProjectPointFileApiUrl\(activeProjectId,\s*pointFileId\)\)/, 'Surface Weaver should fetch selected point file details from the project API');
  assert.match(html, /btnLoadProjectPointFile\.addEventListener\("click",\s*async\s*\(\)\s*=>\s*\{[\s\S]*await\s+loadProjectPointFileIntoCsv\(\)/, 'Surface Weaver should wire the load button to import selected point file text into the CSV editor');
  assert.match(html, /function\s+updateFogForBox\(box3\)\s*\{[\s\S]*scene\.fog\.near\s*=\s*fogNear;[\s\S]*scene\.fog\.far\s*=\s*fogFar;/, 'Surface Weaver should compute adaptive fog bounds so zooming does not fade the entire viewport to blank');
  assert.match(html, /renderFromText\(text\)\{[\s\S]*updateSunForBounds\(box3\);[\s\S]*updateFogForBox\(box3\);/, 'Surface Weaver should apply adaptive fog when rendering a surface');
  assert.match(html, /btnFit\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*updateSunForBounds\(box3\);[\s\S]*updateFogForBox\(box3\);/, 'Surface Weaver should refresh fog bounds when fitting the camera to the surface');
});
