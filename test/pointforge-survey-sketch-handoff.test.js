import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('POINT_TRANSFORMER.HTML exposes Open in Survey Sketch handoff controls', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="btnOpenSurveySketch"/, 'PointForge should render the Survey Sketch handoff button');
  assert.match(html, /const\s+SURVEY_SKETCH_IMPORT_STORAGE_KEY\s*=\s*"surveySketchPointforgeImport"/, 'PointForge should use a stable localStorage key for handoff');
  assert.match(html, /window\.open\("\/VIEWPORT\.HTML\?source=pointforge",\s*"_blank",\s*"noopener,noreferrer"\)/, 'PointForge should open Survey Sketch in a new tab with source flag');
});

test('VIEWPORT.HTML auto-imports PointForge payloads', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"surveySketchPointforgeImport"/, 'Survey Sketch should read the same handoff localStorage key');
  assert.match(html, /function\s+tryImportPointforgePayload\(\)/, 'Survey Sketch should define PointForge import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"pointforge"/, 'Survey Sketch import bootstrap should be gated by query param');
  assert.match(html, /importCsvText\(payload\.csv,\s*"PointForge import"\)/, 'Survey Sketch should reuse CSV import pipeline for PointForge payloads');
});
