import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('RecordQuarry includes ROS geolocation metadata in EvidenceDesk export payloads', async () => {
  const html = await readFile(new URL('../RecordQuarry.html', import.meta.url), 'utf8');

  assert.match(html, /function\s+deriveRosGeolocationForExport\(feature\s*=\s*\{\}\)\s*\{[\s\S]*polygon-centroid[\s\S]*line-first-vertex/, 'RecordQuarry should derive geolocation from ROS feature geometry for export payloads.');
  assert.match(html, /const\s+geolocation\s*=\s*deriveRosGeolocationForExport\(feature\);[\s\S]*if\s*\(geolocation\)\s*metadata\.geolocation\s*=\s*geolocation;/, 'RecordQuarry should append derived geolocation into ROS metadata before saving.');
  assert.match(html, /rosPayload\.push\(\{[\s\S]*metadata,[\s\S]*geolocation,[\s\S]*starredInFieldBook:\s*true,/, 'RecordQuarry ROS API payloads should include geolocation alongside metadata.');
  assert.match(html, /reference:\s*\{[\s\S]*metadata:\s*\{[\s\S]*mapImageUrl,[\s\S]*thumbnailUrl,[\s\S]*geolocation,[\s\S]*\.\.\.metadata,/, 'RecordQuarry project-file ROS metadata should persist geolocation for EvidenceDesk consumers.');
});
