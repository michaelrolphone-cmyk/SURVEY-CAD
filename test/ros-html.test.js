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
  assert.match(html, /function\s+fetchSubdivisionGeometry2243FromPoint\s*\(/, 'export lookup should define subdivision outSR refetch helper to keep subdivision geometry scale aligned');
  assert.match(html, /state\.subdivisionFeature2243\s*=\s*await\s*fetchSubdivisionGeometry2243FromPoint\(lon, lat\)/, 'export lookup should fetch subdivision geometry using shared export SR helper');
  assert.match(html, /state\.sectionFeature2243\s*=\s*await\s*fetchSectionGeometry2243FromPoint\(lon, lat\)/, 'export lookup should fetch containing section geometry in export SR');
});



test('RecordQuarry.html renders nearby subdivision polygons/cards and plat thumbnails for parcels', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /SUBDIVISION_NEARBY_RADIUS_FT\s*=\s*666/, 'nearby subdivision search radius should be 666 feet');
  assert.match(html, /function\s+findNearbySubdivisions\s*\(/, 'lookup should define a nearby subdivision polygon query helper');
  assert.match(html, /distance:\s*SUBDIVISION_NEARBY_RADIUS_M/, 'nearby subdivision query should use the configured parcel buffer distance');
  assert.match(html, /geometryType:\s*'esriGeometryPoint'/, 'nearby subdivision query should use parcel centroid point geometry to avoid mass polygon intersections');
  assert.match(html, /const\s+nearbyWithPlatData\s*=\s*await\s*attachSubdivisionPlatData\(/, 'lookup should enrich nearby subdivisions with plat metadata');
  assert.match(html, /function\s+dedupeNearbySubdivisionEntries\s*\(/, 'lookup should collapse duplicate subdivision geometries to one card per subdivision name/id');
  assert.match(html, /function\s+drawSubdivisionPolygons\s*\(/, 'lookup should define a subdivision polygon renderer for nearby features');
  assert.match(html, /SUBDIVISION_DRAW_MAX_VERTICES\s*=\s*1200/, 'nearby subdivision rendering should cap polygon vertices to keep the UI responsive');
  assert.match(html, /simplifyPolygonForDisplay\(feature,\s*SUBDIVISION_DRAW_MAX_VERTICES\)/, 'subdivision renderer should simplify heavy polygon geometries before painting them');
  assert.match(html, /drawSubdivisionPolygons\(nearbySubdivisionEntries\)/, 'lookup should draw each nearby subdivision polygon on the map');
  assert.match(html, /SUBDIVISION_PLAT_LIST_URL\s*=\s*'\/api\/recordquarry\/subdivision-plats\/page-list'/, 'lookup should source plat index data from Ada County subdivision list');
  assert.match(html, /\/api\/project-files\/pdf-thumbnail\?\$\{new URLSearchParams\(\{ source: platUrl \}\)\}/, 'subdivision plat cards should resolve PDF thumbnails through the cached thumbnail API');
  assert.match(html, /Open subdivision plat/, 'subdivision cards should include direct plat links');
  assert.match(html, /setSubdivisionSelected\(entry, idx, next\)/, 'subdivision cards should support star-based include/exclude toggles');
  assert.match(html, /function\s+extractSubdivisionSourceIdentifiers\s*\(/, 'subdivision plat matching should derive identifier hints from subdivision attributes for resilient list matching');
  assert.match(html, /platDocId,\s*platPage,/, 'subdivision plat parser should capture document id/page metadata from SubsPageList references');
  assert.match(html, /selectedSubdivisionKeys:\s*new\s+Set\(\)/, 'lookup should initialize subdivision selection state for export');
  assert.match(html, /Place Subdivision, Township, Section, and Utilities above Aliquots/, 'lookup flow should build subdivision cards in the summary card stack before ROS rendering');
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
  assert.match(html, /function\s+buildAdaCountyRosImageMeta\s*\(/, 'ROS cards should derive Ada County scan URLs from RS lookup identifiers');
  assert.match(html, /function\s+buildRosImageHtml\s*\(/, 'ROS cards should render a reusable scan thumbnail/link block');
  assert.match(html, /Open full-size ROS image/, 'ROS image block should include a link to the full-resolution scan');
  assert.match(html, /class=\"ros-scan-thumb\"/, 'ROS image block should include a thumbnail image element');
  assert.match(html, /extraHtml:\s*buildRosImageHtml\(a\)/, 'ROS summary cards should render scan thumbnails for each record entry');
  assert.match(html, /const\s+imageHtml\s*=\s*buildRosImageHtml\(attrs\);/, 'ROS map popup should include the same scan thumbnail/link block');
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
  assert.match(html, /function\s+extractInstrumentFromCpfIdentifier\s*\(/, 'CP&F export should derive instrument ids from linked PDF names when instrument fields are missing');
  assert.match(html, /function\s+resolveCpfRecordInstrument\s*\(/, 'CP&F export should resolve instruments from attributes, names, or links');
  assert.match(html, /const\s+fromLink\s*=\s*extractInstrumentFromCpfIdentifier\(link\);/, 'CP&F resolution should fallback to PDF links to recover instrument numbers');
  assert.match(html, /function\s+uniqueCpInstrumentNote\s*\(/, 'export should format CP&F instrument notes for CSV notes column');
  assert.match(html, /const\s+inst\s*=\s*resolveCpfRecordInstrument\(record\);/, 'CP&F notes should be generated from resolved instrument values so PDF-only records are persisted');
  assert.match(html, /CPNFS:\s*\$\{values\.join\('\.\.\.'\)\}/, 'CP&F notes should use CPNFS prefix and ... separator');
});


test('RecordQuarry.html can export unique boundary points directly to PointForge', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /id="btnExportPointForge"/, 'ROS should render an Export to PointForge button');
  assert.match(html, /<header>[\s\S]*id="btnExportPointForge"\s+class="workflowPrimary workflowAction"/, 'ROS should place the PointForge workflow button in the upper-right header as a primary action');
  assert.doesNotMatch(html, /<div class="h">Map \+ Results<\/div>[\s\S]*id="btnExportPointForge"/, 'ROS should not keep the PointForge workflow button in the map panel action row');
  assert.match(html, /const\s+POINTFORGE_ROS_IMPORT_STORAGE_KEY\s*=\s*"pointforgeRosImport"/, 'ROS should use a stable localStorage key for PointForge handoff');
  assert.match(html, /const\s+PROJECT_FILE_STORAGE_PREFIX\s*=\s*"surveyfoundryProjectFile"/, 'ROS should use a stable localStorage prefix for project file snapshots');
  assert.match(html, /async\s+function\s+persistPointForgeExportProjectFile\s*\(/, 'ROS should persist PointForge export references into the active project file');
  assert.match(html, /parseCpfInstrumentsFromNotesMap\(notesByCoordinate\)/, 'PointForge export project file should parse CP&F instruments from gathered notes');
  assert.match(html, /function\s+normalizeCpInstrumentNumber\s*\(/, 'RecordQuarry should normalize CP&F instrument numbers before saving');
  assert.match(html, /replace\(\/\\s\+\/g, ' '\)\s*\.toUpperCase\(\)/, 'instrument normalization should collapse whitespace and uppercase values to avoid duplicate variants');
  assert.match(html, /referenceType === 'instrument-number'[\s\S]*normalizeCpInstrumentNumber\(item\?\.reference\?\.value\) === referenceValue/, 'project file duplicate check should compare normalized instrument-number references');
  assert.match(html, /folder:\s*'cpfs'[\s\S]*reference:\s*\{[\s\S]*type:\s*'instrument-number'/, 'PointForge export project file should add CP&F instrument references');
  assert.match(html, /const\s+selectedSubdivisions\s*=\s*getSelectedSubdivisionEntries\(state\.nearbySubdivisions\)/, 'PointForge export project file should collect starred subdivisions');
  assert.match(html, /folder:\s*'plats'[\s\S]*resolverHint:\s*'subdivision-plat'/, 'PointForge export project file should write starred subdivisions into plats folder');
  assert.match(html, /folder:\s*'ros'[\s\S]*reference:\s*\{[\s\S]*type:\s*'ros-number'/, 'PointForge export project file should add selected ROS references');
  assert.match(html, /const\s+rosName\s*=\s*await\s*resolveRosNameForExport\(attrs,\s*imageMeta\);[\s\S]*const\s+label\s*=\s*rosName\s*\|\|\s*bestRosLabel\(attrs\)/, 'PointForge export should prefer the SurveysPageList ROS name for exported titles before falling back to attribute labels');
  assert.match(html, /ADA_ROS_SURVEYS_PAGE_LIST_URL\s*=\s*'\/api\/recordquarry\/records-of-survey\/page-list'/, 'ROS title lookup should load SurveysPageList through a same-origin API endpoint to avoid CORS failures');
  assert.match(html, /metadata:\s*\{[\s\S]*title:\s*label,[\s\S]*mapImageUrl,[\s\S]*thumbnailUrl,[\s\S]*\.\.\.metadata,[\s\S]*starredInFieldBook:\s*true[\s\S]*\}/, 'PointForge project-file ROS metadata should flatten export fields and merge only non-duplicated supplemental metadata attributes');
  assert.match(html, /rosPayload\.push\(\{[\s\S]*title:\s*label,[\s\S]*mapImageUrl,[\s\S]*thumbnailUrl,[\s\S]*metadata,[\s\S]*starredInFieldBook:\s*true[\s\S]*\}\);/, 'project ROS sync payload should include resolved titles and thumbnail/map URLs while keeping supplemental metadata in a dedicated object');
  assert.match(html, /function\s+buildRosMetadataForExport\(attributes\s*=\s*\{\},\s*rosNameOverride\s*=\s*null\)\s*\{[\s\S]*return\s*\{[\s\S]*rosName,[\s\S]*rosSourceId,[\s\S]*aliquot,[\s\S]*sourceAttributes:[\s\S]*\};[\s\S]*\}/, 'supplemental ROS metadata helper should only emit non-duplicated metadata fields');
  assert.match(html, /state\.selectedRosKeys\s*=\s*new\s+Set\(\);/, 'lookup should leave ROS records unselected by default for export');
  assert.match(html, /setRosSelected\(f, index, next\);/, 'ROS cards should support star-based include/exclude export toggling');
  assert.match(html, /folder:\s*'point-files'[\s\S]*type:\s*'local-storage'[\s\S]*POINTFORGE_ROS_IMPORT_STORAGE_KEY/, 'PointForge export project file should add the PointForge CSV handoff reference');
  assert.match(html, /\$\("btnExportPointForge"\)\.disabled\s*=\s*false/, 'ROS should enable PointForge export after loading export geometry');
  assert.match(html, /const\s+notesByCoordinate\s*=\s*await\s*buildCpfNotesByCoordinate\(plssPoints\);[\s\S]*parcelFeature2243:\s*filterParcelFeatureForExport\(state\.parcelFeature2243,\s*state\.selectedParcel\),[\s\S]*subdivisionFeature2243:\s*null,[\s\S]*includePlssWithoutNotes:\s*false[\s\S]*buildPowerUtilityMarkersForPointForge\(state\.utilityLocations,\s*uniquePart\.nextPoint\)[\s\S]*buildPointMarkerCsvRowsPNEZD\(utilityMarkers,\s*uniquePart\.nextPoint,\s*''\)[\s\S]*const\s+pointForgeCsv\s*=\s*`\$\{uniquePart\.csv\}\$\{utilityRows\.csv\}`[\s\S]*localStorage\.setItem\(POINTFORGE_ROS_IMPORT_STORAGE_KEY,\s*JSON\.stringify\(\{[\s\S]*csv:\s*pointForgeCsv/, 'ROS should prefetch CP&F notes, append Idaho Power utility points, and persist PointForge payload CSV');
  assert.match(html, /const\s+projectFileUpdate\s*=\s*await\s+persistPointForgeExportProjectFile\(\{[\s\S]*notesByCoordinate,[\s\S]*pointCount:\s*uniquePart\.count/, 'PointForge export should save CP&F and point-file references to the project file when a project is active');
  assert.match(html, /fetch\(`\/api\/projects\/\$\{encodeURIComponent\(resolvedProjectContext\.projectId\)\}\/ros`/, 'PointForge export should sync selected ROS references to project ROS API for EvidenceDesk availability');
  assert.match(html, /fetch\(`\/api\/projects\/\$\{encodeURIComponent\(resolvedProjectContext\.projectId\)\}\/plats`/, 'PointForge export should sync starred subdivision plats to project plats API for EvidenceDesk availability');
  assert.match(html, /function\s+buildSubdivisionMetadataForExport\s*\(/, 'PointForge export should build a subdivision metadata payload from feature, geometry, and list-document references');
  assert.match(html, /metadata:\s*subdivisionMetadata/, 'starred subdivision plat sync payload should include the full subdivision metadata object');
  assert.match(html, /function\s+openLinkedApp\s*\(/, 'ROS should define shared cross-app navigation helper');
  assert.match(html, /window\.parent\.postMessage\(\{[\s\S]*type:\s*'survey-cad:navigate-app'[\s\S]*path,/, 'ROS should notify launcher iframe host to navigate embedded app');
  assert.match(html, /openLinkedApp\(buildPointForgeLaunchPath\(\)\)/, 'ROS should navigate PointForge using launcher-aware helper');
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


test('RecordQuarry.html restores address lookup snapshots and avoids auto-project attachment when launched from SurveyFoundry projects', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+PROJECT_LOOKUP_STORAGE_PREFIX\s*=\s*"surveyfoundryProjectLookup"/, 'RecordQuarry keeps the project lookup cache namespace available for explicit project workflows.');
  assert.match(html, /const\s+ADDRESS_LOOKUP_STORAGE_PREFIX\s*=\s*"surveyfoundryAddressLookup"/, 'RecordQuarry should use a stable localStorage prefix for per-address lookup snapshots');
  assert.match(html, /const\s+LAST_LOOKUP_ADDRESS_STORAGE_KEY\s*=\s*"surveyfoundryLastLookupAddress"/, 'RecordQuarry should track the latest looked-up address for restore-on-open behavior');

  assert.match(html, /function\s+loadAddressLookupSnapshot\(address\)/, 'RecordQuarry should load per-address lookup snapshots');
  assert.match(html, /function\s+saveAddressLookupSnapshot\(address, snapshot\)/, 'RecordQuarry should persist per-address lookup snapshots');
  assert.match(html, /function\s+saveLookupSnapshotsForCurrentState\(address\)/, 'RecordQuarry should centralize lookup snapshot persistence through a single helper.');

  assert.match(html, /saveLookupSnapshotsForCurrentState\(rawAddr\);[\s\S]*Saved lookup cache for this address\./, 'lookup flow should persist lookup/selection snapshots to address cache only during lookup completion.');
  assert.doesNotMatch(html, /Saved lookup results to project/, 'lookup interactions should not auto-attach fetched results to project-level records.');

  assert.match(html, /const\s+hasProjectAddress\s*=\s*Boolean\(normalizeAddressStorageKey\(state\.projectContext\.address\)\);/, 'project boot flow should detect when active project includes an address');
  assert.match(html, /const\s+projectAddressSnapshot\s*=\s*hasProjectAddress\s*\?\s*loadAddressLookupSnapshot\(state\.projectContext\.address\)\s*:\s*null;/, 'project boot flow should load per-address cache when active project has an address');
  assert.match(html, /if\s*\(hasProjectAddress\)\s*\{[\s\S]*doLookup\(\{ lookupPayload:\s*projectAddressSnapshot\?\.lookup\s*\|\|\s*null, selectionSnapshot:\s*projectAddressSnapshot\?\.selection\s*\|\|\s*null \}\)/, 'project boot flow should auto-run lookup from per-address cache when a project address is present');
  assert.doesNotMatch(html, /else if \(projectSnapshot\?\.lookup/, 'project boot flow should not auto-restore heavy project snapshots that can freeze app startup.');

  assert.match(html, /const\s+hasLaunchAddress\s*=\s*Boolean\(normalizeAddressStorageKey\(state\.projectContext\.address\)\);/, 'standalone boot flow should honor launch-provided address params even without a project id');
  assert.match(html, /const\s+launchAddressSnapshot\s*=\s*hasLaunchAddress\s*\?\s*loadAddressLookupSnapshot\(state\.projectContext\.address\)\s*:\s*null;/, 'standalone boot flow should try loading cache for launch-provided address params');
  assert.match(html, /if\s*\(hasLaunchAddress\)\s*\{[\s\S]*if\s*\(state\.projectContext\.autostart\)\s*\{[\s\S]*doLookup\(\{ lookupPayload:\s*launchAddressSnapshot\?\.lookup\s*\|\|\s*null, selectionSnapshot:\s*launchAddressSnapshot\?\.selection\s*\|\|\s*null \}\)/, 'launch autostart should execute lookup for address params and reuse per-address cache when available');
  assert.match(html, /const\s+snapshot\s*=\s*loadMostRecentAddressLookupSnapshot\(\);/, 'standalone boot flow should attempt loading the most recent cached address lookup');
});


test('RecordQuarry.html lazy loads ROS TIFF thumbnails through cached API thumbnails', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /\/api\/project-files\/ros-thumbnail\?\$\{new URLSearchParams\(\{ source: meta\.fullSizeUrl \}\)\}/, 'RecordQuarry should derive ROS thumbnail URLs from the ros-thumbnail API endpoint');
  assert.match(html, /data-ros-thumbnail=/, 'ROS image previews should defer network work with data-ros-thumbnail attributes');
  assert.match(html, /async\s+function\s+loadRosThumbnailWithRetry\s*\(/, 'RecordQuarry should include a retry-capable ROS thumbnail loader');
  assert.match(html, /function\s+lazyLoadRosScanThumbnails\s*\(/, 'RecordQuarry should lazily initialize ROS thumbnail loading');
  assert.match(html, /new\s+IntersectionObserver\(/, 'ROS thumbnail loading should be intersection-driven for visible cards');
  assert.match(html, /function\s+showRqHoverPreviewTooltip\s*\(/, 'RecordQuarry should include a hover preview tooltip renderer for thumbnails');
  assert.match(html, /const\s+availableRight\s*=\s*Math\.max\(0, viewportWidth - anchorRect\.right - RQ_HOVER_GAP - RQ_HOVER_MARGIN\);/, 'hover preview placement should measure right-side space from the hovered thumbnail');
  assert.match(html, /const\s+placements\s*=\s*\[[\s\S]*\]\.sort\(\(a, b\) => b\.fit\.score - a\.fit\.score\);/, 'hover preview placement should choose the largest non-overlapping viewport fit');
  assert.match(html, /bindRqHoverPreview\(imgEl, imgEl\.alt \|\| 'ROS preview'\);/, 'ROS thumbnails should enable enlarged hover preview behavior once loaded');
  assert.match(html, /bindRqHoverPreview\(imgEl, imgEl\.alt \|\| 'CP&F preview'\);/, 'CP&F thumbnails should enable enlarged hover preview behavior once loaded');
  assert.match(html, /left\s*=\s*Math\.min\(Math\.max\(RQ_HOVER_MARGIN, left\), viewportWidth - previewWidth - RQ_HOVER_MARGIN\);/, 'hover preview should clamp inside viewport bounds');
  assert.match(html, /window\.addEventListener\('scroll', \(\) => hideRqHoverPreviewTooltip\(\), \{ passive: true \}\);/, 'hover preview should dismiss on scroll to avoid stale placement');
  assert.match(html, /lazyLoadRosScanThumbnails\(\);/, 'lookup completion should trigger ROS thumbnail lazy loading');
});
test('RecordQuarry.html keeps aliquots deselected by default and behind parcel interaction layers', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /state\.selectedAliquotKeys\.clear\(\);[\s\S]*drawAliquots\(state\.aliquotFeatures, section\);/, 'lookup should leave all aliquots deselected by default before drawing aliquot geometry');
  assert.match(html, /state\.selectedRosKeys\s*=\s*new\s+Set\(\);/, 'lookup should initialize ROS selection state as empty so RoS starts deselected');
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


test('RecordQuarry.html creates project-file folders with Drawings before RoS', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(
    html,
    /folders:\s*\[[\s\S]*createProjectFileFolder\('drawings',\s*'Drawings'[\s\S]*createProjectFileFolder\('ros',\s*'RoS'/,
    'Drawings should be listed before RoS in project-file folder defaults',
  );
});



test('RecordQuarry.html hardens CP&F persistence parsing and project-context resolution during PointForge handoff', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+resolveProjectContextForProjectFile\s*\(/, 'RecordQuarry should define a helper to recover project context before saving handoff artifacts');
  assert.match(html, /const\s+runtimeContext\s*=\s*getProjectContext\(\);/, 'project-context recovery should inspect runtime launch params when state context is missing');
  assert.match(html, /const\s+resolvedProjectContext\s*=\s*resolveProjectContextForProjectFile\(projectContext\);/, 'PointForge export persistence should always use resolved project context');
  assert.match(html, /function\s+applySelectionByMode\s*\(/, 'selection restore should use shared include/exclude snapshot application logic');
  assert.match(html, /applySelectionByMode\(\s*state\.selectedRosKeys,[\s\S]*false\s*\)/, 'ROS selection restore should keep RoS deselected by default when no prior snapshot is present');
  assert.match(html, /function\s+deriveRosImageMeta\s*\(attrs\s*=\s*\{\}\)\s*\{\s*return\s+buildAdaCountyRosImageMeta\(attrs\);\s*\}/, 'PointForge export persistence should use a defined ROS image metadata helper when creating RoS project file links');
  assert.match(html, /replace\(\/\^CPNFS\?:\\s\*\/i, ''\)/, 'CP&F note parsing should accept both CPNF and CPNFS prefixes');
  assert.match(html, /split\(\/\(\?:\\\.\{3\}\|…\|,\|;\|\\n\)\+\/g\)/, 'CP&F note parsing should tolerate multiple separators to avoid dropping instrument references');
});
test('RecordQuarry.html passes active project context when opening PointForge from export handoff', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /openLinkedApp\(buildPointForgeLaunchPath\(\)\);/, 'PointForge handoff should build launch URLs from a shared helper so project context is preserved');
  assert.match(html, /function\s+buildPointForgeLaunchPath\s*\(\)\s*\{[\s\S]*const\s+params\s*=\s*new\s+URLSearchParams\(\{\s*source:\s*'ros'\s*\}\);/, 'PointForge handoff helper should include the ros source marker');
  assert.match(html, /if \(projectId\) params\.set\('projectId', projectId\);/, 'PointForge handoff helper should include active project id when available');
  assert.match(html, /if \(projectName\) params\.set\('projectName', projectName\);/, 'PointForge handoff helper should include active project name when available');
});
