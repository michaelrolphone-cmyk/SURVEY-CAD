import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ROS.html defines buildExportGeoJSON used by lookup/export flow', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+buildExportGeoJSON\s*\(/, 'buildExportGeoJSON should be defined');
  assert.match(html, /state\.exportGeoJSON\s*=\s*buildExportGeoJSON\(\)/, 'lookup should assign export data');
  assert.match(html, /downloadJson\(state\.exportGeoJSON,\s*"ada_lookup\.geojson"\)/, 'export button should download generated GeoJSON');
});

test('ROS.html routes ROS PDF links through API server and exports unique parcel/subdivision/aliquot CSV points', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.match(html, /buildRosPdfProxyUrl\(p\.url\)/, 'ROS PDF links should use API proxy URL');
  assert.match(html, /function\s+buildPdfProxyLinks\s*\(/, 'helper should build shared API PDF links for ROS and aliquots');
  assert.match(html, /Open\s+Aliquot\s+PDF\s*\(API\)/, 'aliquot cards should include API PDF links when available');
  assert.doesNotMatch(html, /sv\.includes\("\/"\)/, 'relative PDF fields without slash should still be proxied');
  assert.match(html, /drawCornerMarkers\(/, 'corner markers should be drawn on the map');
  assert.match(html, /buildRosBoundaryCsvRowsPNEZD\(/, 'CSV export should use ROS-specific simplified point-code export builder');
  assert.match(html, /id="btnExportParcelCSV"[^>]*>Export CSV<\/button>/, 'CSV export button label should be simplified to Export CSV');
  assert.match(html, /parcel_subdivision_aliquots_unique_points_idw_ft_pnezd\.csv/, 'CSV filename should reflect unique parcel/subdivision/aliquot points');
  assert.match(html, /state\.sectionFeature2243\s*=\s*await\s*fetchSectionGeometry2243FromPoint\(lon, lat\)/, 'export lookup should fetch containing section geometry in export SR');
});

test('ROS.html keeps ROS scoped to containing section and includes popup PDF links', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+normalizeRosFeatures\s*\(/, 'lookup ROS payloads should normalize feature wrappers');
  assert.match(html, /function\s+filterRosFeaturesForSection\s*\(/, 'ROS should be filtered to containing section geometry');
  assert.match(html, /ROS in containing section:/, 'log should indicate section-scoped ROS count');
  assert.match(html, /m\.bindPopup\(buildRosPopupHtml\(/, 'ROS point popups should use shared popup HTML with PDF links');
  assert.match(html, /l\.bindPopup\(buildRosPopupHtml\(/, 'ROS line popups should use shared popup HTML with PDF links');
  assert.match(html, /p\.bindPopup\(buildRosPopupHtml\(/, 'ROS polygon popups should use shared popup HTML with PDF links');
  assert.match(html, /function\s+buildRosPopupHtml\s*\(/, 'ROS popup helper should include description and PDF links');
});


test('ROS.html loads CP&F PDF links when a corner marker is selected', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

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


test('ROS.html can export unique boundary points directly to PointForge', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.match(html, /id="btnExportPointForge"/, 'ROS should render an Export to PointForge button');
  assert.match(html, /const\s+POINTFORGE_ROS_IMPORT_STORAGE_KEY\s*=\s*"pointforgeRosImport"/, 'ROS should use a stable localStorage key for PointForge handoff');
  assert.match(html, /\$\("btnExportPointForge"\)\.disabled\s*=\s*false/, 'ROS should enable PointForge export after loading export geometry');
  assert.match(html, /const\s+notesByCoordinate\s*=\s*await\s*buildCpfNotesByCoordinate\(plssPoints\);[\s\S]*includePlssWithoutNotes:\s*false[\s\S]*localStorage\.setItem\(POINTFORGE_ROS_IMPORT_STORAGE_KEY,\s*JSON\.stringify\(\{[\s\S]*csv:\s*uniquePart\.csv/, 'ROS should prefetch CP&F notes and persist only CP&F-backed PLSS points for PointForge payload');
  assert.match(html, /function\s+openLinkedApp\s*\(/, 'ROS should define shared cross-app navigation helper');
  assert.match(html, /window\.parent\.postMessage\(\{[\s\S]*type:\s*'survey-cad:navigate-app'[\s\S]*path,/, 'ROS should notify launcher iframe host to navigate embedded app');
  assert.match(html, /openLinkedApp\('\/POINT_TRANSFORMER\.HTML\?source=ros'\)/, 'ROS should navigate PointForge using launcher-aware helper');
});

test('ROS.html shows a busy processing modal while CPNF instrument numbers are gathered for exports', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.match(html, /id="busyModal"\s+class="busyModal"/, 'ROS should render an export processing modal container');
  assert.match(html, /Gathering CPNF instrument numbers for exported points\./, 'modal copy should explain CPNF instrument gathering progress');
  assert.match(html, /function\s+setBusyModalOpen\s*\(/, 'ROS should expose a helper to toggle the processing modal');
  assert.match(html, /setBusyModalOpen\(true, 'Exporting CSV… gathering CPNF instrument numbers'\)/, 'CSV export should open modal before CPNF lookup');
  assert.match(html, /setBusyModalOpen\(true, 'Exporting to PointForge… gathering CPNF instrument numbers'\)/, 'PointForge export should open modal before CPNF lookup');
  assert.match(html, /setBusyModalOpen\(false\);[\s\S]*\}\s*\);/, 'exports should close the modal in completion paths');
});




test('ROS.html renders Summary in the left control panel between PDF upload and Diagnostics', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  const leftPanelMatch = html.match(/<!-- LEFT -->[\s\S]*?<\/div>\s*<\/div>\s*\n\n\s*<!-- RIGHT -->/);
  assert.ok(leftPanelMatch, 'left panel markup should be present');
  const leftPanel = leftPanelMatch[0];

  assert.match(leftPanel, /PDF Basis of Bearing \(local upload\)/, 'left panel should include PDF upload section');
  assert.match(leftPanel, /<div class="h">Summary<\/div>/, 'left panel should include Summary section');
  assert.match(leftPanel, /<div class="h">Diagnostics<\/div>/, 'left panel should include Diagnostics section');
  assert.ok(leftPanel.indexOf('PDF Basis of Bearing (local upload)') < leftPanel.indexOf('<div class="h">Summary</div>'), 'Summary should appear below PDF upload section');
  assert.ok(leftPanel.indexOf('<div class="h">Summary</div>') < leftPanel.indexOf('<div class="h">Diagnostics</div>'), 'Summary should appear above Diagnostics section');

  assert.doesNotMatch(html, /class="summaryPanel"/, 'right map panel should no longer include a separate summary panel block');
});

test('ROS.html does not render internal CORS/map-fix commentary text', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /Map not displaying fix:/, 'ROS should not show internal map debug commentary');
  assert.doesNotMatch(html, /Automatic PDF download is usually blocked by CORS\./, 'ROS should not show internal CORS commentary in upload section');
  assert.doesNotMatch(html, /PDFs require upload \(CORS\)/, 'ROS should not show old CORS warning pill copy');
});
