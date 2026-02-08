import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ROS.html defines buildExportGeoJSON used by lookup/export flow', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+buildExportGeoJSON\s*\(/, 'buildExportGeoJSON should be defined');
  assert.match(html, /state\.exportGeoJSON\s*=\s*buildExportGeoJSON\(\)/, 'lookup should assign export data');
  assert.match(html, /downloadJson\(state\.exportGeoJSON,\s*"ada_lookup\.geojson"\)/, 'export button should download generated GeoJSON');
});

test('ROS.html routes ROS PDF links through API server and exports marker corners', async () => {
  const html = await readFile(new URL('../ROS.html', import.meta.url), 'utf8');

  assert.match(html, /buildRosPdfProxyUrl\(p\.url\)/, 'ROS PDF links should use API proxy URL');
  assert.match(html, /drawCornerMarkers\(/, 'corner markers should be drawn on the map');
  assert.match(html, /buildPolygonCornerCsvRowsPNEZD\(/, 'polygon corner CSV rows should be exported');
  assert.match(html, /buildPointMarkerCsvRowsPNEZD\(/, 'marker point CSV rows should be exported');
});
