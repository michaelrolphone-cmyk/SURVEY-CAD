import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('POINT_TRANSFORMER.HTML exposes Open in Survey Sketch handoff controls', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="btnOpenSurveySketch"/, 'PointForge should render the Survey Sketch handoff button');
  assert.match(html, /const\s+SURVEY_SKETCH_IMPORT_STORAGE_KEY\s*=\s*"surveySketchPointforgeImport"/, 'PointForge should use a stable localStorage key for handoff');
  assert.match(html, /function\s+openLinkedApp\s*\(/, 'PointForge should define shared cross-app navigation helper');
  assert.match(html, /window\.parent\.postMessage\(\{[\s\S]*type:\s*"survey-cad:navigate-app"[\s\S]*path,/, 'PointForge should notify launcher iframe host to navigate embedded app');
  assert.match(html, /openLinkedApp\("\/VIEWPORT\.HTML\?source=pointforge"\)/, 'PointForge should navigate Survey Sketch using launcher-aware helper');
  assert.match(html, /const\s+code\s*=\s*trimOrEmpty\(record\.fields\[4\]\)/, 'PointForge should map CSV column 5 into Survey Sketch code field');
  assert.match(html, /const\s+notes\s*=\s*trimOrEmpty\(record\.fields\[5\]\)/, 'PointForge should map CSV column 6 into Survey Sketch notes field');
  assert.match(html, /rows\.push\(\[number, x, y, z, code, notes\]\)/, 'PointForge should preserve both code and notes when handing off to Survey Sketch');
  assert.match(html, /const\s+georeferencePoints\s*=\s*\[\]/, 'PointForge should collect georeference samples for Survey Sketch map alignment');
  assert.match(html, /georeference:\s*\{[\s\S]*type:\s*"idaho-state-plane-usft"[\s\S]*zone,[\s\S]*swapXY,[\s\S]*points:\s*georeferencePoints/, 'PointForge handoff payload should include georeference metadata and sample points');
});

test('VIEWPORT.HTML auto-imports PointForge payloads', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"surveySketchPointforgeImport"/, 'Survey Sketch should read the same handoff localStorage key');
  assert.match(html, /function\s+tryImportPointforgePayload\(\)/, 'Survey Sketch should define PointForge import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"pointforge"/, 'Survey Sketch import bootstrap should be gated by query param');
  assert.match(html, /importCsvText\(payload\.csv,\s*"PointForge import"\)/, 'Survey Sketch should reuse CSV import pipeline for PointForge payloads');
  assert.match(html, /const\s+aligned\s*=\s*syncViewToGeoreference\(payload\)/, 'Survey Sketch should apply georeference alignment when PointForge provides it');
  assert.match(html, /if \(aligned && mapLayerState\.enabled\) \{[\s\S]*syncMapToView\(true\);/, 'Survey Sketch should refresh map view after georeference alignment when map layer is enabled');
});


test('POINT_TRANSFORMER.HTML auto-imports ROS export payloads when launched from ROS tool', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+ROS_POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"pointforgeRosImport"/, 'PointForge should use a stable localStorage key for ROS handoff payloads');
  assert.match(html, /function\s+tryImportRosPayload\(\)/, 'PointForge should define ROS import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"ros"/, 'PointForge ROS import bootstrap should be gated by query param');
  assert.match(html, /localStorage\.getItem\(ROS_POINTFORGE_IMPORT_STORAGE_KEY\)/, 'PointForge should read ROS payload from localStorage');
  assert.match(html, /elIn\.value\s*=\s*String\(payload\.csv\);[\s\S]*processNow\(\);/, 'PointForge should load ROS CSV payload and process it immediately');
});


test('POINT_TRANSFORMER.HTML omits internal default-lock and passthrough commentary copy', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /Defaults locked:/, 'PointForge should not render internal defaults-locked commentary text');
  assert.doesNotMatch(html, /Input:\s*<span class="kbd">NAME,X,Y,Z\[,CODE\[,NOTES\]\]<\/span>\. Output sorted by point number\./, 'PointForge should not render verbose input/output commentary text');
  assert.doesNotMatch(html, /plus code\/notes passthrough/, 'PointForge should not render code\/notes passthrough commentary text');
});
