import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('RecordQuarry.html includes RecordQuarry branding in the document title and header', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /<title>RecordQuarry — Ada County Survey Context Lookup \(Standalone\)<\/title>/, 'RecordQuarry should set branded document title');
  assert.match(html, /<div class="title">RecordQuarry — Ada County Survey Context Lookup \(Standalone\)<\/div>/, 'RecordQuarry should show branded app header title');
});

test('RecordQuarry.html still builds export GeoJSON internally for lookup payload composition', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+buildExportGeoJSON\s*\(/, 'buildExportGeoJSON should be defined');
  assert.match(html, /state\.exportGeoJSON\s*=\s*buildExportGeoJSON\(\)/, 'lookup should assign export data for internal state');
  assert.doesNotMatch(html, /id="btnExportGeo"/, 'GeoJSON export button should be removed from UI');
  assert.doesNotMatch(html, /downloadJson\(state\.exportGeoJSON,\s*"ada_lookup\.geojson"\)/, 'GeoJSON download click handler should be removed');
});

test('RecordQuarry.html routes ROS PDF links through API server and exports unique parcel/subdivision/aliquot CSV points', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /buildRosPdfProxyUrl\(p\.url\)/, 'ROS PDF links should use API proxy URL');
  assert.match(html, /function\s+buildPdfProxyLinks\s*\(/, 'helper should build shared API PDF links for ROS and aliquots');
  assert.match(html, /Open\s+CP&F\s+PDF\s*\(API\)/, 'aliquot cards should include CP&F API PDF links when available');
  assert.doesNotMatch(html, /sv\.includes\("\/"\)/, 'relative PDF fields without slash should still be proxied');
  assert.match(html, /drawCornerMarkers\(/, 'corner markers should be drawn on the map');
  assert.match(html, /buildRosBoundaryCsvRowsPNEZD\(/, 'CSV export should use ROS-specific simplified point-code export builder');
  assert.match(html, /id="btnExportParcelCSV"[^>]*>Export CSV<\/button>/, 'CSV export button label should be simplified to Export CSV');
  assert.match(html, /<!-- LEFT -->[\s\S]*id="btnExportParcelCSV"[\s\S]*<!-- RIGHT -->/, 'CSV export button should live in the left panel controls');
  assert.match(html, /parcel_subdivision_aliquots_unique_points_idw_ft_pnezd\.csv/, 'CSV filename should reflect unique parcel/subdivision/aliquot points');
  assert.match(html, /state\.sectionFeature2243\s*=\s*await\s*fetchSectionGeometry2243FromPoint\(lon, lat\)/, 'export lookup should fetch containing section geometry in export SR');
});

test('RecordQuarry.html keeps ROS scoped to containing section and includes popup PDF links', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+normalizeRosFeatures\s*\(/, 'lookup ROS payloads should normalize feature wrappers');
  assert.match(html, /function\s+filterRosFeaturesForSection\s*\(/, 'ROS should be filtered to containing section geometry');
  assert.match(html, /ROS in containing section:/, 'log should indicate section-scoped ROS count');
  assert.match(html, /m\.bindPopup\(buildRosPopupHtml\(/, 'ROS point popups should use shared popup HTML with PDF links');
  assert.match(html, /l\.bindPopup\(buildRosPopupHtml\(/, 'ROS line popups should use shared popup HTML with PDF links');
  assert.match(html, /p\.bindPopup\(buildRosPopupHtml\(/, 'ROS polygon popups should use shared popup HTML with PDF links');
  assert.match(html, /function\s+buildRosPopupHtml\s*\(/, 'ROS popup helper should include description and PDF links');
});


test('RecordQuarry.html summary cards can center/zoom map for ROS and aliquots and aliquot popups include CP&F links', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+centerMapOnFeature\s*\(/, 'summary card selection should use a shared map centering helper');
  assert.match(html, /onSelect:\s*\(\)\s*=>\s*centerMapOnFeature\(f,\s*layers\.aliquots/, 'aliquot summary cards should center/zoom to selected aliquot');
  assert.match(html, /onSelect:\s*\(\)\s*=>\s*centerMapOnFeature\(f,\s*layers\.ros/, 'ROS summary cards should center/zoom to selected ROS feature');
  assert.match(html, /function\s+buildAliquotPopupHtml\s*\(/, 'aliquot marker popups should use shared popup builder');
  assert.match(html, /Open CP&F PDF \(API\)/, 'aliquot popup/summary should label CP&F PDF links');
  assert.match(html, /l\.bindPopup\(popupHtml\)/, 'aliquot map markers should bind popup HTML with CP&F links');
  assert.match(html, /Corner CP&amp;F records/, 'aliquot summary cards should include a corner CP&F records section');
  assert.match(html, /data-aliquot-cpf-links=/, 'aliquot summary cards should render lazy-load placeholder nodes for CP&F links');
  assert.match(html, /function\s+lazyLoadAliquotSummaryCpfLinks\s*\(/, 'aliquot summary should lazy-load CP&F links after rendering cards');
  assert.match(html, /lazyLoadAliquotSummaryCpfLinks\(aliquotSummaryCpfTargets\)/, 'lookup flow should trigger lazy loading for aliquot summary CP&F links');
  assert.match(html, /function\s+queryCpfRecordsForAliquot\s*\(/, 'aliquot summary lazy loading should query CP&F records from aliquot corners');
  assert.match(html, /function\s+flattenCpfRecordLinks\s*\(/, 'aliquot summary should de-duplicate CP&F links from multiple corners');
});


test('RecordQuarry.html loads CP&F PDF links when a corner marker is selected', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /ADA_CPF_WEBMAP_ITEM_ID/, 'CP&F web map id should be configured');
  assert.match(html, /discoverAdaCpfLayerViaJsonp\(/, 'should discover CP&F layer from Ada web map');
  assert.match(html, /queryCpfRecordsNearCorner\(/, 'corner selection should query nearby CP&F records');
  assert.match(html, /typeof\s+v\s*===\s*'object'\s*\?\s*JSON\.stringify\(v\)\s*:\s*String\(v\)/, 'jsonp query helper should serialize object params as JSON for ArcGIS geometry payloads');
  assert.match(html, /haversineMeters\(north, east, y, x\)/, 'corner CP&F lookup should compute feature distance from selected corner');
  assert.match(html, /record\.distanceMeters\s*==\s*null\s*\|\|\s*record\.distanceMeters\s*<=\s*\(radius\s*\+\s*0\.5\)/, 'corner CP&F lookup should filter to records near the selected corner instead of section-wide results');
  assert.match(html, /buildCpfPdfLinks\(/, 'CP&F lookup should build candidate PDF links from instrument/url/name fields');
  assert.match(html, /buildRosPdfProxyUrl\(url\)/, 'CP&F links should route through API PDF proxy');
  assert.match(html, /marker\.on\('click', async \(\) => \{[\s\S]*queryCpfRecordsNearCorner\(corner\.north, corner\.east\)/, 'corner marker click handler should trigger CP&F lookup');
  assert.match(html, /function\s+uniqueCpInstrumentNote\s*\(/, 'export should format CP&F instrument notes for CSV notes column');
  assert.match(html, /CPNFS:\s*\$\{values\.join\('\.\.\.'\)\}/, 'CP&F notes should use CPNFS prefix and ... separator');
});


test('RecordQuarry.html can export unique boundary points directly to PointForge', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /id="btnExportPointForge"/, 'ROS should render an Export to PointForge button');
  assert.match(html, /<header>[\s\S]*id="btnExportPointForge"\s+class="workflowPrimary workflowAction"/, 'ROS should place the PointForge workflow button in the upper-right header as a primary action');
  assert.doesNotMatch(html, /<div class="h">Map \+ Results<\/div>[\s\S]*id="btnExportPointForge"/, 'ROS should not keep the PointForge workflow button in the map panel action row');
  assert.match(html, /const\s+POINTFORGE_ROS_IMPORT_STORAGE_KEY\s*=\s*"pointforgeRosImport"/, 'ROS should use a stable localStorage key for PointForge handoff');
  assert.match(html, /const\s+PROJECT_FILE_STORAGE_PREFIX\s*=\s*"surveyfoundryProjectFile"/, 'ROS should use a stable localStorage prefix for project file snapshots');
  assert.match(html, /function\s+persistPointForgeExportProjectFile\s*\(/, 'ROS should persist PointForge export references into the active project file');
  assert.match(html, /parseCpfInstrumentsFromNotesMap\(notesByCoordinate\)/, 'PointForge export project file should parse CP&F instruments from gathered notes');
  assert.match(html, /function\s+normalizeCpInstrumentNumber\s*\(/, 'RecordQuarry should normalize CP&F instrument numbers before saving');
  assert.match(html, /replace\(\/\\s\+\/g, ' '\)\s*\.toUpperCase\(\)/, 'instrument normalization should collapse whitespace and uppercase values to avoid duplicate variants');
  assert.match(html, /referenceType === 'instrument-number'[\s\S]*normalizeCpInstrumentNumber\(item\?\.reference\?\.value\) === referenceValue/, 'project file duplicate check should compare normalized instrument-number references');
  assert.match(html, /folder:\s*'cpfs'[\s\S]*reference:\s*\{[\s\S]*type:\s*'instrument-number'/, 'PointForge export project file should add CP&F instrument references');
  assert.match(html, /folder:\s*'point-files'[\s\S]*type:\s*'local-storage'[\s\S]*POINTFORGE_ROS_IMPORT_STORAGE_KEY/, 'PointForge export project file should add the PointForge CSV handoff reference');
  assert.match(html, /\$\("btnExportPointForge"\)\.disabled\s*=\s*false/, 'ROS should enable PointForge export after loading export geometry');
  assert.match(html, /const\s+notesByCoordinate\s*=\s*await\s*buildCpfNotesByCoordinate\(plssPoints\);[\s\S]*includePlssWithoutNotes:\s*false[\s\S]*localStorage\.setItem\(POINTFORGE_ROS_IMPORT_STORAGE_KEY,\s*JSON\.stringify\(\{[\s\S]*csv:\s*uniquePart\.csv/, 'ROS should prefetch CP&F notes and persist only CP&F-backed PLSS points for PointForge payload');
  assert.match(html, /const\s+projectFileUpdate\s*=\s*persistPointForgeExportProjectFile\(\{[\s\S]*notesByCoordinate,[\s\S]*pointCount:\s*uniquePart\.count/, 'PointForge export should save CP&F and point-file references to the project file when a project is active');
  assert.match(html, /function\s+openLinkedApp\s*\(/, 'ROS should define shared cross-app navigation helper');
  assert.match(html, /window\.parent\.postMessage\(\{[\s\S]*type:\s*'survey-cad:navigate-app'[\s\S]*path,/, 'ROS should notify launcher iframe host to navigate embedded app');
  assert.match(html, /openLinkedApp\('\/POINT_TRANSFORMER\.HTML\?source=ros'\)/, 'ROS should navigate PointForge using launcher-aware helper');
});

test('RecordQuarry.html shows a busy processing modal while CPNF instrument numbers are gathered for exports', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /id="busyModal"\s+class="busyModal"/, 'ROS should render an export processing modal container');
  assert.match(html, /id="busyModalDetail"/, 'modal should render a detail line that can be reused for lookup and export progress text');
  assert.match(html, /Gathering CPNF instrument numbers for exported points\./, 'modal copy should explain CPNF instrument gathering progress');
  assert.match(html, /function\s+setBusyModalOpen\s*\(isOpen,\s*message\s*=\s*'Processing export…',\s*detail\s*=\s*'Gathering CPNF instrument numbers for exported points\.'\)/, 'ROS should expose a helper to toggle modal messaging for both lookup and export progress');
  assert.match(html, /setBusyModalOpen\(true, 'Loading RecordQuarry data…', 'Querying address, parcel, subdivision, section, township, ROS, and aliquot records\.'\);/, 'lookup should show a loading modal while RecordQuarry fetches data');
  assert.match(html, /const\s+lookupButton\s*=\s*\$\("btnLookup"\);[\s\S]*lookupButton\.disabled\s*=\s*true;/, 'lookup should disable the Lookup button while requests are running');
  assert.match(html, /finally\s*\{[\s\S]*setBusyModalOpen\(false\);[\s\S]*lookupButton\.disabled\s*=\s*false;/, 'lookup should always close modal and re-enable Lookup button');
  assert.match(html, /setBusyModalOpen\(true, 'Exporting CSV… gathering CPNF instrument numbers'\)/, 'CSV export should open modal before CPNF lookup');
  assert.match(html, /setBusyModalOpen\(true, 'Exporting to PointForge… gathering CPNF instrument numbers'\)/, 'PointForge export should open modal before CPNF lookup');
  assert.match(html, /setBusyModalOpen\(false\);[\s\S]*\}\s*\);/, 'exports should close the modal in completion paths');
});




test('RecordQuarry.html renders Summary in the left control panel between PDF upload and Diagnostics', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  const leftPanelMatch = html.match(/<!-- LEFT -->[\s\S]*?<\/div>\s*<\/div>\s*\n\n\s*<!-- RIGHT -->/);
  assert.ok(leftPanelMatch, 'left panel markup should be present');
  const leftPanel = leftPanelMatch[0];

  assert.match(leftPanel, /PDF Basis of Bearing \(local upload\)/, 'left panel should include PDF upload section');
  assert.match(leftPanel, /<div class="h">Summary<\/div>/, 'left panel should include Summary section');
  assert.match(leftPanel, /<div class="h">Diagnostics<\/div>/, 'left panel should include Diagnostics section');
  assert.ok(leftPanel.indexOf('PDF Basis of Bearing (local upload)') < leftPanel.indexOf('<div class="h">Summary</div>'), 'Summary should appear below PDF upload section');
  assert.ok(leftPanel.indexOf('<div class="h">Summary</div>') < leftPanel.indexOf('<div class="h">Diagnostics</div>'), 'Summary should appear above Diagnostics section');

  assert.doesNotMatch(html, /class="summaryPanel"/, 'right map panel should no longer include a separate summary panel block');
  assert.doesNotMatch(html, /<div class="h">Map \+ Results<\/div>/, 'right panel header bar should be removed to maximize map area');
  assert.doesNotMatch(html, /id="btnExportGeo"/, 'Map panel should not include GeoJSON export control');
});

test('RecordQuarry.html does not render internal CORS/map-fix commentary text', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /Map not displaying fix:/, 'ROS should not show internal map debug commentary');
  assert.doesNotMatch(html, /Automatic PDF download is usually blocked by CORS\./, 'ROS should not show internal CORS commentary in upload section');
  assert.doesNotMatch(html, /PDFs require upload \(CORS\)/, 'ROS should not show old CORS warning pill copy');
});

test('RecordQuarry.html includes mobile layout rules so map and controls stay visible', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /html,body\{height:100%;min-height:100dvh;/, 'mobile viewport should use dynamic viewport height to keep map panel visible');
  assert.match(html, /\.app\{[\s\S]*min-height:100dvh;/, 'app shell should fill dynamic viewport height on mobile browsers');
  assert.match(html, /@media \(max-width: 760px\)\{[\s\S]*\.panel \.phead \.row\{[\s\S]*flex-wrap:wrap;/, 'mobile panel header controls should wrap to avoid clipping controls');
  assert.match(html, /@media \(max-width: 760px\)\{[\s\S]*\.panel \.phead \.row button\{[\s\S]*flex:1 1 140px;/, 'mobile panel buttons should expand and remain tappable');
  assert.match(html, /@media \(max-width: 760px\)\{[\s\S]*\.main\{[\s\S]*grid-template-rows:minmax\(460px, auto\) minmax\(420px, 1fr\);/, 'mobile grid rows should reserve explicit space for map/results panel');
});


test('RecordQuarry.html restores and saves project lookup snapshots when launched from SurveyFoundry projects', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+PROJECT_LOOKUP_STORAGE_PREFIX\s*=\s*"surveyfoundryProjectLookup"/, 'RecordQuarry should use a stable localStorage prefix for project lookup snapshots');
  assert.match(html, /const\s+ADDRESS_LOOKUP_STORAGE_PREFIX\s*=\s*"surveyfoundryAddressLookup"/, 'RecordQuarry should use a stable localStorage prefix for per-address lookup snapshots');
  assert.match(html, /const\s+LAST_LOOKUP_ADDRESS_STORAGE_KEY\s*=\s*"surveyfoundryLastLookupAddress"/, 'RecordQuarry should track the latest looked-up address for restore-on-open behavior');
  assert.match(html, /function\s+getProjectContext\(\)/, 'RecordQuarry should parse launcher-provided project context from URL params');
  assert.match(html, /params\.get\(\"projectId\"\)\s*\|\|\s*params\.get\(\"activeProjectId\"\)/, 'RecordQuarry should accept activeProjectId launcher param aliases');
  assert.match(html, /params\.get\(\"projectName\"\)\s*\|\|\s*params\.get\(\"activeProjectName\"\)/, 'RecordQuarry should accept activeProjectName launcher param aliases');
  assert.match(html, /params\.get\(\"client\"\)\s*\|\|\s*params\.get\(\"activeClient\"\)/, 'RecordQuarry should accept activeClient launcher param aliases');
  assert.match(html, /function\s+loadProjectLookupSnapshot\(projectId\)/, 'RecordQuarry should load saved project lookup snapshots');
  assert.match(html, /function\s+saveProjectLookupSnapshot\(projectId, snapshot\)/, 'RecordQuarry should persist lookup snapshots back to project storage');
  assert.match(html, /function\s+loadAddressLookupSnapshot\(address\)/, 'RecordQuarry should load per-address lookup snapshots');
  assert.match(html, /function\s+saveAddressLookupSnapshot\(address, snapshot\)/, 'RecordQuarry should persist per-address lookup snapshots');
  assert.match(html, /function\s+readSelectionSnapshot\(\)/, 'RecordQuarry should serialize selected and deselected export state');
  assert.match(html, /function\s+applySelectionSnapshot\(selection = null\)/, 'RecordQuarry should restore selected and deselected export state');
  assert.match(html, /const\s+cachedAddressSnapshot\s*=\s*\(!options\.lookupPayload && !options\.disableAddressCache\)/, 'lookup flow should check per-address cache before network lookups');
  assert.match(html, /const\s+lookup\s*=\s*options\.lookupPayload\s*\|\|\s*cachedAddressSnapshot\?\.lookup\s*\|\|\s*await\s*lookupByAddress\(rawAddr\)/, 'lookup flow should support restoring cached project and address lookup payloads');
  assert.match(html, /saveLookupSnapshotsForCurrentState\(rawAddr\);/, 'lookup flow should persist lookup and selection snapshots for project and per-address restores');
  assert.match(html, /doLookup\(\{ lookupPayload:\s*snapshot\.lookup, selectionSnapshot:\s*snapshot\.selection \}\)/, 'autostart flow should restore cached lookup payload and selection snapshot when project snapshot exists');
  assert.match(html, /const\s+hasProjectAddress\s*=\s*Boolean\(normalizeAddressStorageKey\(state\.projectContext\.address\)\);/, 'project boot flow should detect when active project includes an address');
  assert.match(html, /const\s+projectAddressSnapshot\s*=\s*hasProjectAddress\s*\?\s*loadAddressLookupSnapshot\(state\.projectContext\.address\)\s*:\s*null;/, 'project boot flow should load per-address cache when active project has an address');
  assert.match(html, /if\s*\(hasProjectAddress\)\s*\{[\s\S]*doLookup\(\{ lookupPayload:\s*launchLookupPayload, selectionSnapshot:\s*launchSelectionSnapshot \}\)/, 'project boot flow should auto-run lookup when project address is present and use cached payload when available');
  assert.match(html, /if\s*\(projectAddressSnapshot\?\.lookup\)\s*\{[\s\S]*log\(`Restoring cached results for project address/, 'project boot flow should prefer cached per-address data before project snapshot restore');
  assert.match(html, /\} else if \(projectSnapshot\?\.lookup\) \{[\s\S]*log\(`Restoring saved project results from/, 'project boot flow should fallback to project snapshot when no per-address cache is available');
  assert.match(html, /\} else if \(projectSnapshot\?\.lookup && state\.projectContext\.autostart\)/, 'project autostart without a project address should continue restoring project snapshots only when requested');
  assert.match(html, /const\s+hasLaunchAddress\s*=\s*Boolean\(normalizeAddressStorageKey\(state\.projectContext\.address\)\);/, 'standalone boot flow should honor launch-provided address params even without a project id');
  assert.match(html, /const\s+launchAddressSnapshot\s*=\s*hasLaunchAddress\s*\?\s*loadAddressLookupSnapshot\(state\.projectContext\.address\)\s*:\s*null;/, 'standalone boot flow should try loading cache for launch-provided address params');
  assert.match(html, /if\s*\(hasLaunchAddress\)\s*\{[\s\S]*if\s*\(state\.projectContext\.autostart\)\s*\{[\s\S]*doLookup\(\{ lookupPayload:\s*launchAddressSnapshot\?\.lookup\s*\|\|\s*null, selectionSnapshot:\s*launchAddressSnapshot\?\.selection\s*\|\|\s*null \}\)/, 'launch autostart should execute lookup for address params and reuse per-address cache when available');
  assert.match(html, /const\s+snapshot\s*=\s*loadMostRecentAddressLookupSnapshot\(\);/, 'standalone boot flow should attempt loading the most recent cached address lookup');
});

test('RecordQuarry.html keeps aliquots deselected by default and behind parcel interaction layers', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /state\.selectedAliquotKeys\.clear\(\);[\s\S]*drawAliquots\(state\.aliquotFeatures, section\);/, 'lookup should leave all aliquots deselected by default before drawing aliquot geometry');
  assert.match(html, /map\.createPane\('aliquotPolygons'\);[\s\S]*map\.getPane\('aliquotPolygons'\)\.style\.zIndex\s*=\s*'380';/, 'aliquot polygons should render on their own lower pane');
  assert.match(html, /const\s+layer\s*=\s*L\.geoJSON\(gj,\s*\{[\s\S]*pane:\s*'aliquotPolygons',/, 'aliquot polygons should use the lower aliquot pane');
  assert.match(html, /function\s+buildCornerMarkerEntries\(\)\s*\{[\s\S]*\{\s*role:\s*'aliquot'[\s\S]*\{\s*role:\s*'subdivision'[\s\S]*\{\s*role:\s*'parcel'/, 'corner marker layering should add aliquot markers before subdivision and parcel markers so parcel interactions remain reachable');
});

test('RecordQuarry.html omits internal service/layer label pills beneath the address input', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /Service:\s*External\/ExternalMap/, 'address controls should not show service label pill copy');
  assert.doesNotMatch(html, /Parcel:\s*layer\s*24/, 'address controls should not show parcel layer label pill copy');
  assert.doesNotMatch(html, /Address:\s*layer\s*16/, 'address controls should not show address layer label pill copy');
});
