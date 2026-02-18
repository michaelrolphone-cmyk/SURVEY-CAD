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
  assert.match(html, /function\s+updateFogForBox\(box3\)\s*\{[\s\S]*const\s+cameraDistance\s*=\s*camera\.position\.distanceTo\(center\);[\s\S]*scene\.fog\.near\s*=\s*fogNear;[\s\S]*scene\.fog\.far\s*=\s*fogFar;/, 'Surface Weaver should compute adaptive fog bounds from camera distance so zooming does not fade the viewport to blank');
  assert.match(html, /renderFromText\(text\)\{[\s\S]*updateSunForBounds\(box3\);[\s\S]*updateFogForBox\(box3\);/, 'Surface Weaver should apply adaptive fog when rendering a surface');
  assert.match(html, /function\s+updateCameraClippingForBox\(box3\)\s*\{[\s\S]*camera\.near\s*=\s*near;[\s\S]*camera\.far\s*=\s*far;[\s\S]*camera\.updateProjectionMatrix\(\);/, 'Surface Weaver should dynamically expand camera clipping planes so zooming does not clip the mesh to a blank screen');
  assert.match(html, /orbit\.zoomToCursor\s*=\s*false;/, 'Surface Weaver should disable cursor snap zoom behavior so wheel zoom does not unexpectedly jump the camera into the mesh');
  assert.match(html, /function\s+updateOrbitDistanceLimits\(box3\)\s*\{[\s\S]*const\s+diagonal\s*=\s*Math\.max\(size\.length\(\),\s*1\);[\s\S]*orbit\.minDistance\s*=\s*Math\.max\(0\.5,\s*diagonal\s*\*\s*0\.03,\s*maxDim\s*\*\s*0\.05\);[\s\S]*orbit\.maxDistance\s*=\s*Math\.max\(diagonal\s*\*\s*600,\s*orbit\.minDistance\s*\*\s*30,\s*12000\);/, 'Surface Weaver should keep orbit zoom from entering the surface while preserving a broad zoom-out range');
  assert.match(html, /function\s+fitViewToBox\(box3\)\s*\{[\s\S]*updateOrbitDistanceLimits\(box3\);[\s\S]*orbit\.update\(\);/, 'Surface Weaver should refresh orbit distance limits when fitting to data bounds');
  assert.match(html, /btnFit\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*fitViewToBox\(box3\);[\s\S]*updateSunForBounds\(box3\);/, 'Surface Weaver should fit camera navigation to the surface extents');
  assert.match(html, /function\s+animate\(\)\{[\s\S]*if \(lastBounds\) \{[\s\S]*updateCameraClippingForBox\(lastBounds\);[\s\S]*updateFogForBox\(lastBounds\);/, 'Surface Weaver should continuously refresh clipping and fog while users zoom or navigate');
});
