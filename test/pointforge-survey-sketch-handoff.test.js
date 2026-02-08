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
  assert.match(html, /rows\.push\(\[number, x, y, z, code, ""\]\)/, 'PointForge should map transformed description values into Survey Sketch code field');
});

test('VIEWPORT.HTML auto-imports PointForge payloads', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"surveySketchPointforgeImport"/, 'Survey Sketch should read the same handoff localStorage key');
  assert.match(html, /function\s+tryImportPointforgePayload\(\)/, 'Survey Sketch should define PointForge import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"pointforge"/, 'Survey Sketch import bootstrap should be gated by query param');
  assert.match(html, /importCsvText\(payload\.csv,\s*"PointForge import"\)/, 'Survey Sketch should reuse CSV import pipeline for PointForge payloads');
});


test('POINT_TRANSFORMER.HTML auto-imports ROS export payloads when launched from ROS tool', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+ROS_POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"pointforgeRosImport"/, 'PointForge should use a stable localStorage key for ROS handoff payloads');
  assert.match(html, /function\s+tryImportRosPayload\(\)/, 'PointForge should define ROS import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"ros"/, 'PointForge ROS import bootstrap should be gated by query param');
  assert.match(html, /localStorage\.getItem\(ROS_POINTFORGE_IMPORT_STORAGE_KEY\)/, 'PointForge should read ROS payload from localStorage');
  assert.match(html, /elIn\.value\s*=\s*String\(payload\.csv\);[\s\S]*processNow\(\);/, 'PointForge should load ROS CSV payload and process it immediately');
});
