import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('RecordQuarry builds subdivision plat doc-id index and caps nearby subdivision results', async () => {
  const html = await fs.readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+SUBDIVISION_NEARBY_MAX_RESULTS\s*=\s*18\s*;/, 'RecordQuarry should cap nearby subdivision results to avoid rendering freezes.');
  assert.match(html, /const\s+byDocId\s*=\s*new\s+Map\(\);[\s\S]*if\s*\(docIdKey\s*&&\s*!byDocId\.has\(docIdKey\)\)\s+byDocId\.set\(docIdKey,\s*parsed\);/, 'RecordQuarry should index subdivision plats by document id for fast matching.');
  assert.match(html, /for\s*\(const\s+sourceId\s+of\s+sourceIds\)\s*\{[\s\S]*byDocId\?\.get\(/, 'RecordQuarry should match subdivision plats via the indexed source-id map.');
  assert.match(html, /geometryType:\s*'esriGeometryPoint'[\s\S]*geometry:\s*`\$\{centroid\.x\},\$\{centroid\.y\}`[\s\S]*distance:\s*SUBDIVISION_NEARBY_RADIUS_M/, 'RecordQuarry should query nearby subdivisions from the parcel centroid point with the configured radius.');
  assert.match(html, /state\.nearbySubdivisions\s*=\s*dedupeNearbySubdivisionEntries\(nearbyWithPlatData,\s*parcel\);/, 'RecordQuarry should dedupe nearby subdivision results using subdivision identity, not parcel-lot object IDs.');
  assert.match(html, /state\.nearbySubdivisions\s*=\s*limitNearbySubdivisionEntries\(state\.nearbySubdivisions,\s*parcel,\s*SUBDIVISION_NEARBY_MAX_RESULTS\);/, 'RecordQuarry should trim nearby subdivision entries before rendering cards.');
  assert.match(html, /function\s+simplifyPolygonForDisplay\s*\(/, 'RecordQuarry should simplify heavy subdivision geometries before drawing.');
  assert.match(html, /const\s+displayFeature\s*=\s*simplifyPolygonForDisplay\(feature,\s*SUBDIVISION_DRAW_MAX_VERTICES\);/, 'RecordQuarry should render subdivision polygons using simplified display geometry.');
});
