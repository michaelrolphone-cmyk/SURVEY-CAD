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
  assert.match(html, /buildUniquePolygonCsvRowsPNEZD\(/, 'CSV export should use unique polygon vertices');
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
  assert.match(html, /haversineMeters\(lat, lon, y, x\)/, 'corner CP&F lookup should compute feature distance from selected corner');
  assert.match(html, /record\.distanceMeters\s*==\s*null\s*\|\|\s*record\.distanceMeters\s*<=\s*\(radius\s*\+\s*0\.5\)/, 'corner CP&F lookup should filter to records near the selected corner instead of section-wide results');
  assert.match(html, /buildCpfPdfLinks\(/, 'CP&F lookup should build candidate PDF links from instrument/url/name fields');
  assert.match(html, /buildRosPdfProxyUrl\(url\)/, 'CP&F links should route through API PDF proxy');
  assert.match(html, /marker\.on\('click', async \(\) => \{[\s\S]*queryCpfRecordsNearCorner\(corner\.north, corner\.east\)/, 'corner marker click handler should trigger CP&F lookup');
});
