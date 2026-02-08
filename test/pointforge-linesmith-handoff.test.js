import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('POINT_TRANSFORMER.HTML exposes Open in LineSmith handoff controls', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');


  assert.match(html, /id="renumberStart"\s+type="number"\s+min="1"\s+step="1"\s+value="1"/, 'PointForge should render a configurable renumber start input defaulting to 1');
  assert.match(html, /id="btnRenumber"/, 'PointForge should render an explicit renumber action button');
  assert.match(html, /function\s+transformPoints\(text\)/, 'PointForge processing pipeline should keep its original transform signature');
  assert.match(html, /function\s+renumberOutputFromStart\(startValue\)/, 'PointForge should define explicit output renumber helper');
  assert.match(html, /elRenumber\.addEventListener\("click",\s*\(\)=>renumberOutputFromStart\(elRenumberStart\.value\)\);/, 'PointForge should only renumber when the renumber button is clicked');
  assert.doesNotMatch(html, /transformPoints\(input,\s*\{\s*renumberStart\s*\}\)/, 'PointForge should not apply sequential renumbering during normal processing');
  assert.doesNotMatch(html, /sortable\.forEach\(\(r,\s*index\)=>\{[\s\S]*renumberStart/, 'PointForge transform should not force sequential renumbering by default');
  assert.match(html, /id="btnOpenLineSmith"/, 'PointForge should render the LineSmith handoff button');
  assert.match(html, /const\s+SURVEY_SKETCH_IMPORT_STORAGE_KEY\s*=\s*"lineSmithPointforgeImport"/, 'PointForge should use a stable localStorage key for handoff');
  assert.match(html, /function\s+openLinkedApp\s*\(/, 'PointForge should define shared cross-app navigation helper');
  assert.match(html, /window\.parent\.postMessage\(\{[\s\S]*type:\s*"survey-cad:navigate-app"[\s\S]*path,/, 'PointForge should notify launcher iframe host to navigate embedded app');
  assert.match(html, /openLinkedApp\("\/VIEWPORT\.HTML\?source=pointforge"\)/, 'PointForge should navigate LineSmith using launcher-aware helper');
  assert.match(html, /const\s+code\s*=\s*trimOrEmpty\(record\.fields\[4\]\)/, 'PointForge should map CSV column 5 into LineSmith code field');
  assert.match(html, /const\s+notes\s*=\s*trimOrEmpty\(record\.fields\[5\]\)/, 'PointForge should map CSV column 6 into LineSmith notes field');
  assert.match(html, /const\s+handoffX\s*=\s*swapXY\s*\?\s*y\s*:\s*x\s*;/, 'PointForge should map handoff X to the state-plane easting used by LineSmith');
  assert.match(html, /const\s+handoffY\s*=\s*swapXY\s*\?\s*x\s*:\s*y\s*;/, 'PointForge should map handoff Y to the state-plane northing used by LineSmith');
  assert.match(html, /rows\.push\(\[number, handoffX, handoffY, z, code, notes\]\)/, 'PointForge should preserve handoff coordinates and metadata without additional normalization');
  assert.match(html, /const\s+georeferencePoints\s*=\s*\[\]/, 'PointForge should collect georeference samples for LineSmith map alignment');
  assert.match(html, /georeference:\s*\{[\s\S]*type:\s*"idaho-state-plane-usft"[\s\S]*zone,[\s\S]*swapXY,[\s\S]*points:\s*georeferencePoints/, 'PointForge handoff payload should include georeference metadata and sample points');
  assert.match(html, /georeferencePoints\.push\(\{\s*x:\s*handoffX,\s*y:\s*handoffY,\s*lat,\s*lng:\s*lon\s*\}\)/, 'PointForge georeference samples should be keyed to the exact handoff coordinates');
});

test('VIEWPORT.HTML auto-imports PointForge payloads', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"lineSmithPointforgeImport"/, 'LineSmith should read the same handoff localStorage key');
  assert.match(html, /function\s+tryImportPointforgePayload\(\)/, 'LineSmith should define PointForge import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"pointforge"/, 'LineSmith import bootstrap should be gated by query param');
  assert.match(html, /importCsvText\(payload\.csv,\s*"PointForge import"\)/, 'LineSmith should reuse CSV import pipeline for PointForge payloads');
  assert.match(html, /const\s+aligned\s*=\s*syncViewToGeoreference\(payload\)/, 'LineSmith should apply georeference alignment when PointForge provides it');
  assert.match(html, /if \(aligned && mapLayerState\.enabled\) \{[\s\S]*syncMapToView\(true\);/, 'LineSmith should refresh map view after georeference alignment when map layer is enabled');
});


test('POINT_TRANSFORMER.HTML auto-imports ROS export payloads when launched from ROS tool', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+ROS_POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"pointforgeRosImport"/, 'PointForge should use a stable localStorage key for ROS handoff payloads');
  assert.match(html, /function\s+tryImportRosPayload\(\)/, 'PointForge should define ROS import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"ros"/, 'PointForge ROS import bootstrap should be gated by query param');
  assert.match(html, /localStorage\.getItem\(ROS_POINTFORGE_IMPORT_STORAGE_KEY\)/, 'PointForge should read ROS payload from localStorage');
  assert.match(html, /elIn\.value\s*=\s*String\(payload\.csv\);[\s\S]*processNow\(\);/, 'PointForge should load ROS CSV payload and process it immediately');
  assert.match(html, /setImportContextFromRos\(\)/, 'PointForge ROS bootstrap should label imports as sourced from RecordQuarry');
});

test('POINT_TRANSFORMER.HTML persists project point-file imports and exports with source-aware names', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+PROJECT_FILE_STORAGE_PREFIX\s*=\s*"surveyfoundryProjectFile"/, 'PointForge should use SurveyFoundry project-file storage namespace');
  assert.match(html, /function\s+persistPointSetToProjectFile\s*\(/, 'PointForge should persist imported and exported point sets into project-file point folders');
  assert.match(html, /window\.prompt\("Name this pasted point set:",\s*"Pasted Point Set"\)/, 'PointForge should prompt for names when point sets are pasted');
  assert.match(html, /function\s+formatPointFileDate\s*\([\s\S]*return\s+`\$\{month\}\s+\$\{day\}\s+\$\{year\}`;/, 'PointForge should format appended dates as M D YY');
  assert.match(html, /function\s+buildEditedExportFileName\s*\([\s\S]*Edited/, 'PointForge exported edited files should append Edited to import-derived names');
  assert.match(html, /a\.download\s*=\s*buildEditedExportFileName\(/, 'PointForge downloads should use edited filename derivation');
  assert.match(html, /persistPointSetToProjectFile\(\{\s*kind:\s*"import"/, 'PointForge should persist imported point sets to project file');
  assert.match(html, /persistPointSetToProjectFile\(\{\s*kind:\s*"export"/, 'PointForge should persist exported point sets to project file');
});

test('POINT_TRANSFORMER.HTML supports Project Browser point-file imports and point editor table view', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+PROJECT_BROWSER_POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"pointforgeProjectBrowserImport"/, 'PointForge should use a stable localStorage key for Project Browser handoff payloads');
  assert.match(html, /function\s+tryImportProjectBrowserPayload\(\)/, 'PointForge should define Project Browser import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"project-browser"/, 'PointForge Project Browser import bootstrap should be gated by query param');
  assert.match(html, /localStorage\.getItem\(PROJECT_BROWSER_POINTFORGE_IMPORT_STORAGE_KEY\)/, 'PointForge should read project browser payload from localStorage');
  assert.match(html, /id="btnToggleInputView"/, 'PointForge should render a button to toggle textarea and point editor views');
  assert.match(html, /id="inputTableWrap"/, 'PointForge should render a tabular input point editor container');
  assert.match(html, /id="outputTableWrap"/, 'PointForge should render a tabular output points container');
  assert.match(html, /function\s+setPointEditorView\(enabled\)/, 'PointForge should define a helper to switch between textarea and point editor modes');
});


test('POINT_TRANSFORMER.HTML omits internal default-lock and passthrough commentary copy', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /Defaults locked:/, 'PointForge should not render internal defaults-locked commentary text');
  assert.doesNotMatch(html, /Input:\s*<span class="kbd">NAME,X,Y,Z\[,CODE\[,NOTES\]\]<\/span>\. Output sorted by point number\./, 'PointForge should not render verbose input/output commentary text');
  assert.doesNotMatch(html, /plus code\/notes passthrough/, 'PointForge should not render code\/notes passthrough commentary text');
});
