import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('POINT_TRANSFORMER.HTML exposes Open in LineSmith handoff controls', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');


  assert.match(html, /id="renumberStart"\s+type="number"\s+min="1"\s+step="1"\s+value="1"/, 'PointForge should render a configurable renumber start input defaulting to 1');
  assert.match(html, /id="btnRenumber"/, 'PointForge should render an explicit renumber action button');
  assert.match(html, /id="enableLocalization"\s+type="checkbox"/, 'PointForge should render a localization toggle so anchor localization can be configured in the GUI');
  assert.match(html, /id="anchorLat"/, 'PointForge should render an anchor latitude input for localization');
  assert.match(html, /id="anchorLon"/, 'PointForge should render an anchor longitude input for localization');
  assert.match(html, /id="anchorPointNumber"/, 'PointForge should render an anchor point number input for localization');
  assert.doesNotMatch(html, /id="anchorLocalX"/, 'PointForge should not require manual local X anchor entry in localization UI');
  assert.doesNotMatch(html, /id="anchorLocalY"/, 'PointForge should not require manual local Y anchor entry in localization UI');
  assert.match(html, /function\s+localizeRecords\(recordsSorted\)/, 'PointForge should define a localization routine that applies anchor offsets before output');
  assert.match(html, /const\s+projectedAnchor\s*=\s*proj4\("WGS84",\s*def,\s*\[settings\.lon,\s*settings\.lat\]\)/, 'PointForge localization should project anchor lat\/lon into active state-plane zone');
  assert.match(html, /const\s+anchorLocalHandoffX\s*=\s*anchorRecord\.y\s*;/, 'PointForge localization should derive local handoff X (easting) from stored Y values');
  assert.match(html, /const\s+anchorLocalHandoffY\s*=\s*anchorRecord\.x\s*;/, 'PointForge localization should derive local handoff Y (northing) from stored X values');
  assert.match(html, /localizedRecord\.x\s*=\s*localizedHandoffY\s*;/, 'PointForge localization should write localized northing back to source X column');
  assert.match(html, /localizedRecord\.y\s*=\s*localizedHandoffX\s*;/, 'PointForge localization should write localized easting back to source Y column');
  assert.match(html, /settings\.anchorPointNumber/, 'PointForge localization should resolve the anchor from a point number in the processed set');
  assert.match(html, /Anchor point #\$\{settings\.anchorPointNumber\} was not found/, 'PointForge should show a clear error when the requested anchor point number does not exist');
  assert.match(html, /recordsForOutput\s*=\s*localized\.recordsSorted;/, 'PointForge processing should substitute localized records when localization is enabled');
  assert.match(html, /function\s+transformPoints\(text\)/, 'PointForge processing pipeline should keep its original transform signature');
  assert.match(html, /function\s+renumberOutputFromStart\(startValue\)/, 'PointForge should define explicit output renumber helper');
  assert.match(html, /elRenumber\.addEventListener\("click",\s*\(\)=>renumberOutputFromStart\(elRenumberStart\.value\)\);/, 'PointForge should only renumber when the renumber button is clicked');
  assert.doesNotMatch(html, /transformPoints\(input,\s*\{\s*renumberStart\s*\}\)/, 'PointForge should not apply sequential renumbering during normal processing');
  assert.doesNotMatch(html, /sortable\.forEach\(\(r,\s*index\)=>\{[\s\S]*renumberStart/, 'PointForge transform should not force sequential renumbering by default');
  assert.match(html, /id="btnOpenLineSmith"/, 'PointForge should render the LineSmith handoff button');
  assert.match(html, /<div class="statusbar">[\s\S]*id="btnOpenLineSmith"\s+class="btn workflowPrimary workflowHeaderAction"/, 'PointForge should place the LineSmith workflow button in the upper-right status area as a primary action');
  assert.doesNotMatch(html, /G\/REF RENUMB \+ MAP PREVIEW/, 'PointForge should remove long header subtitle text so the mobile workflow action remains visible');
  assert.doesNotMatch(html, /NAD83 Idaho West map preview and point renumbering\./, 'PointForge should remove the secondary header copy that pushes the workflow action below the fold on mobile');
  assert.match(html, /@media \(max-width: 700px\)\{[\s\S]*\.workflowHeaderAction\{ margin-left: 0; width: 100%; \}/, 'PointForge mobile layout should stretch the workflow header action to remain visible');
  assert.doesNotMatch(html, /<div class="row" style="margin-top:10px;">[\s\S]*id="btnOpenLineSmith"/, 'PointForge should not keep the LineSmith handoff button in the lower ingest controls row');
  assert.match(html, /const\s+SURVEY_SKETCH_IMPORT_STORAGE_KEY\s*=\s*"lineSmithPointforgeImport"/, 'PointForge should use a stable localStorage key for handoff');
  assert.match(html, /function\s+openLinkedApp\s*\(/, 'PointForge should define shared cross-app navigation helper');
  assert.match(html, /window\.parent\.postMessage\(\{[\s\S]*type:\s*"survey-cad:navigate-app"[\s\S]*path,/, 'PointForge should notify launcher iframe host to navigate embedded app');
  assert.match(html, /openLinkedApp\(`\/VIEWPORT\.HTML\?source=pointforge\$\{/, 'PointForge should navigate LineSmith using launcher-aware helper');
  assert.match(html, /const\s+code\s*=\s*trimOrEmpty\(record\.fields\[4\]\)/, 'PointForge should map CSV column 5 into LineSmith code field');
  assert.match(html, /const\s+notes\s*=\s*trimOrEmpty\(record\.fields\[5\]\)/, 'PointForge should map CSV column 6 into LineSmith notes field');
  assert.match(html, /const\s+handoffX\s*=\s*y\s*;/, 'PointForge should export handoff X from source easting values');
  assert.match(html, /const\s+handoffY\s*=\s*x\s*;/, 'PointForge should export handoff Y from source northing values');
  assert.match(html, /const\s+swapXY\s*=\s*false\s*;/, 'PointForge handoff metadata should declare unswapped X/Y coordinates');
  assert.match(html, /rows\.push\(\[number, handoffX, handoffY, z, code, notes\]\)/, 'PointForge should preserve handoff coordinates and metadata without additional normalization');
  assert.match(html, /const\s+georeferencePoints\s*=\s*\[\]/, 'PointForge should collect georeference samples for LineSmith map alignment');
  assert.match(html, /georeference:\s*\{[\s\S]*type:\s*"idaho-state-plane-usft"[\s\S]*zone,[\s\S]*swapXY,[\s\S]*points:\s*georeferencePoints/, 'PointForge handoff payload should include georeference metadata and sample points');
  assert.match(html, /georeferencePoints\.push\(\{\s*x:\s*handoffX,\s*y:\s*handoffY,\s*lat,\s*lng:\s*lon\s*\}\)/, 'PointForge georeference samples should be keyed to the exact handoff coordinates');
});

test('VIEWPORT.HTML auto-imports PointForge payloads', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"lineSmithPointforgeImport"/, 'LineSmith should read the same handoff localStorage key');
  assert.match(html, /function\s+tryImportPointforgePayload\(\)/, 'LineSmith should define PointForge import bootstrap logic');
  assert.match(html, /launchSource\s*!==\s*"pointforge"/, 'LineSmith import bootstrap should be gated by query param');
  assert.match(html, /importCsvText\(payload\.csv,\s*"PointForge import"\)/, 'LineSmith should reuse CSV import pipeline for PointForge payloads');
  assert.match(html, /idx\.x\s*=\s*pick\("x","e","east","easting"\)\s*\?\?\s*1;/, 'LineSmith CSV import should map X columns to easting fields');
  assert.match(html, /idx\.y\s*=\s*pick\("y","n","north","northing"\)\s*\?\?\s*2;/, 'LineSmith CSV import should map Y columns to northing fields');
  assert.match(html, /syncViewToGeoreference\(payload\)/, 'LineSmith should apply georeference alignment when PointForge provides it');
  assert.match(html, /if \(aligned && mapLayerState\.enabled\) \{[\s\S]*syncMapToView\(true\);/, 'LineSmith should refresh map view after georeference alignment when map layer is enabled');
});

test('POINT_TRANSFORMER.HTML saves original and modified points via API on export', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /fetch\("\/api\/pointforge-exports"/, 'PointForge should POST to the pointforge-exports API when exporting');
  assert.match(html, /originalCsv/, 'PointForge API payload should include original CSV');
  assert.match(html, /modifiedCsv/, 'PointForge API payload should include modified CSV');
  assert.match(html, /exportId=/, 'PointForge should pass the export ID to LineSmith via URL param');
  assert.match(html, /persistPointSetToProjectFile\(\{\s*kind:\s*"import"/, 'PointForge should persist original points to project file on export');
  assert.match(html, /persistPointSetToProjectFile\(\{\s*kind:\s*"export"/, 'PointForge should persist modified points to project file on export');
});

test('VIEWPORT.HTML loads points from API and supports socket-based sync', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+loadPointforgeExportFromApi\(exportId\)/, 'LineSmith should define API-based point loading function');
  assert.match(html, /\/api\/pointforge-exports\?id=/, 'LineSmith should fetch exports from the pointforge-exports API');
  assert.match(html, /function\s+savePointsToApi\(\)/, 'LineSmith should define API-based point saving function');
  assert.match(html, /function\s+serializePointsCsv\(\)/, 'LineSmith should define a CSV serialization function for points');
  assert.match(html, /function\s+applyPointforgePayload\(payload\)/, 'LineSmith should define a reusable payload application function');
  assert.match(html, /params\.get\("exportId"\)/, 'LineSmith should check for exportId URL parameter for API-based loading');
  assert.match(html, /message\.type === "pointforge-import"/, 'LineSmith should handle pointforge-import socket messages for real-time sync');
  assert.match(html, /loadPointforgeExportFromApi\(message\.exportId\)/, 'LineSmith should load from API when notified via socket');
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
  assert.match(html, /const\s+PROJECT_LAST_POINT_SET_PREFIX\s*=\s*"surveyfoundryLastPointforgePointSet"/, 'PointForge should define a stable storage namespace for the last-opened project point file');
  assert.match(html, /function\s+persistPointSetToProjectFile\s*\(/, 'PointForge should persist imported and exported point sets into project-file point folders');
  assert.match(html, /window\.prompt\("Name this pasted point set:",\s*"Pasted Point Set"\)/, 'PointForge should prompt for names when point sets are pasted');
  assert.match(html, /function\s+formatPointFileDate\s*\([\s\S]*return\s+`\$\{month\}\s+\$\{day\}\s+\$\{year\}`;/, 'PointForge should format appended dates as M D YY');
  assert.match(html, /function\s+buildEditedExportFileName\s*\([\s\S]*Edited/, 'PointForge exported edited files should append Edited to import-derived names');
  assert.match(html, /a\.download\s*=\s*buildEditedExportFileName\(/, 'PointForge downloads should use edited filename derivation');
  assert.match(html, /persistPointSetToProjectFile\(\{\s*kind:\s*"import"/, 'PointForge should persist imported point sets to project file');
  assert.match(html, /if \(kind === \"import\"\) saveLastOpenedProjectPointSet\(projectContext\.projectId, storageKey\);/, 'PointForge should remember the last imported/opened point file for the active project');
  assert.match(html, /persistPointSetToProjectFile\(\{\s*kind:\s*"export"/, 'PointForge should persist exported point sets to project file');
});

test('POINT_TRANSFORMER.HTML supports Project Browser point-file imports and point editor table view', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+PROJECT_BROWSER_POINTFORGE_IMPORT_STORAGE_KEY\s*=\s*"pointforgeProjectBrowserImport"/, 'PointForge should use a stable localStorage key for Project Browser handoff payloads');
  assert.match(html, /function\s+tryImportProjectBrowserPayload\(\)/, 'PointForge should define Project Browser import bootstrap logic');
  assert.match(html, /params\.get\("source"\)\s*!==\s*"project-browser"/, 'PointForge Project Browser import bootstrap should be gated by query param');
  assert.match(html, /localStorage\.getItem\(PROJECT_BROWSER_POINTFORGE_IMPORT_STORAGE_KEY\)/, 'PointForge should read project browser payload from localStorage');
  assert.match(html, /function\s+tryRestoreLastOpenedProjectPointSet\(\)/, 'PointForge should define a bootstrap helper to reopen the last project point file when launched directly');
  assert.match(html, /if \(params\.get\(\"source\"\)\) return false;/, 'PointForge last-opened bootstrap should only run for direct launches without source param');
  assert.match(html, /loadLastOpenedProjectPointSet\(projectContext\.projectId\)/, 'PointForge should resolve last-opened point files by active project id');
  assert.match(html, /id="btnToggleInputView"/, 'PointForge should render a button to toggle textarea and point editor views');
  assert.match(html, /id="inputTableWrap"/, 'PointForge should render a tabular input point editor container');
  assert.match(html, /id="outputTableWrap"/, 'PointForge should render a tabular output points container');
  assert.match(html, /function\s+setPointEditorView\(enabled\)/, 'PointForge should define a helper to switch between textarea and point editor modes');
  assert.match(html, /function\s+parsePointEditorDocument\(text\)/, 'PointForge point editor should parse full source documents so non-point rows can be preserved while editing');
  assert.match(html, /function\s+pointEditorDocumentToCsv\(documentModel\)/, 'PointForge point editor should serialize edited rows back into the full document with passthrough lines intact');
  assert.match(html, /if \(entry\.type === "raw"\) \{[\s\S]*lines\.push\(entry\.raw \?\? ""\);/, 'PointForge point editor serialization should preserve non-point raw rows when saving edits');
});




test('POINT_TRANSFORMER.HTML moves datum and pipeline chips below the map and removes system chip', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /SYSTEM:\s*ONLINE/, 'PointForge should not render the system online status chip');
  assert.match(html, /<div id="map"><\/div>[\s\S]*?<div class="hint" id="mapHint">[\s\S]*?<div class="mapMetaRow">[\s\S]*?DATUM:\s*<span class="mono">NAD83 \(NO_TRANS\)<\/span>[\s\S]*?PIPELINE:\s*<span class="mono">PARSE → RENUMB → SORT → PLOT<\/span>/, 'PointForge should render datum and pipeline chips below the map');
});
test('POINT_TRANSFORMER.HTML omits internal default-lock and passthrough commentary copy', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /Defaults locked:/, 'PointForge should not render internal defaults-locked commentary text');
  assert.doesNotMatch(html, /Input:\s*<span class="kbd">NAME,X,Y,Z\[,CODE\[,NOTES\]\]<\/span>\. Output sorted by point number\./, 'PointForge should not render verbose input/output commentary text');
  assert.doesNotMatch(html, /plus code\/notes passthrough/, 'PointForge should not render code\/notes passthrough commentary text');
});


test('POINT_TRANSFORMER.HTML uses launcher-aligned simplified styling tokens', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');

  assert.match(html, /--bg0:#0f172a;/, 'PointForge should align base background token with launcher styling');
  assert.match(html, /--text:#e2e8f0;/, 'PointForge should align text token with launcher styling');
  assert.match(html, /--c1:#2a3dff;/, 'PointForge should align primary action color with RecordQuarry workflow blue');
  assert.doesNotMatch(html, /body::after\s*\{[\s\S]*animation:\s*scan/, 'PointForge should not render animated scanline overlay clutter');
});
