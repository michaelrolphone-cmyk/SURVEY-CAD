import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ArrowHead mobile AR app reads LineSmith payload and projects using bearing/elevation camera angles', async () => {
  const html = await readFile(new URL('../ArrowHead.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+ARROWHEAD_IMPORT_STORAGE_KEY\s*=\s*'lineSmithArrowHeadImport'/, 'ArrowHead should consume the LineSmith handoff storage key');

  assert.doesNotMatch(html, /\?\./, 'ArrowHead should avoid optional chaining so older Safari/iOS engines can parse the script');
  assert.doesNotMatch(html, /\.\.\./, 'ArrowHead should avoid object spread syntax for broader iOS Safari compatibility');
  assert.match(html, /navigator\.mediaDevices\.getUserMedia\(/, 'ArrowHead should request camera access for AR video feed');
  assert.match(html, /navigator\.geolocation\.watchPosition\(/, 'ArrowHead should watch GPS updates for world alignment');
  assert.match(html, /window\.addEventListener\('deviceorientationabsolute'/, 'ArrowHead should subscribe to absolute orientation updates when available');
  assert.match(html, /window\.addEventListener\('deviceorientation'/, 'ArrowHead should subscribe to orientation sensor updates');
  assert.match(html, /window\.addEventListener\('devicemotion'/, 'ArrowHead should subscribe to motion sensor updates');
  assert.match(html, /resolvePointElevationFeet\(p\.z, state\.userAltFeet\)/, 'ArrowHead should replace missing or zero point elevations with current phone elevation');
  assert.match(html, /import\s+\{\s*deriveDevicePoseRadians,\s*normalizeRadians\s*\}\s+from\s+"\.\/src\/arrowhead-math\.js";/, 'ArrowHead should use shared orientation math helpers');
  assert.match(html, /import\s+\{\s*computeForwardDistanceMeters,\s*computeRelativeBearingRad,\s*resolvePointElevationFeet\s*\}\s+from\s+"\.\/src\/arrowhead-projection\.js";/, 'ArrowHead should use shared projection helpers');
  assert.match(html, /import\s+\{\s*latLngToWorldAffine,\s*worldToLatLngAffine\s*\}\s+from\s+"\.\/src\/georeference-transform\.js";/, 'ArrowHead should use shared georeference helpers for bidirectional coordinate projection');
  assert.match(html, /const\s+pose\s*=\s*deriveDevicePoseRadians\(event, currentScreenAngle\(\), state\.headingOffsetRad\);/, 'ArrowHead should derive heading and tilt from the normalized orientation helper');
  assert.match(html, /const\s+socket\s*=\s*new\s+WebSocket\(wsUrl\);/, 'ArrowHead should join the LineSmith collaboration websocket room');
  assert.match(html, /function\s+refreshPayloadFromStorage\(options\s*=\s*\{\}\)/, 'ArrowHead should support refreshing LineSmith payload updates while running');
  assert.match(html, /window\.addEventListener\('storage',\s*\(event\)\s*=>\s*\{[\s\S]*event\.key\s*!==\s*ARROWHEAD_IMPORT_STORAGE_KEY/, 'ArrowHead should watch localStorage events for live LineSmith geometry updates');
  assert.match(html, /state\.payloadSyncIntervalId\s*=\s*window\.setInterval\(\(\)\s*=>\s*\{[\s\S]*refreshPayloadFromStorage\(\);[\s\S]*\},\s*1000\);/, 'ArrowHead should poll localStorage to pick up payload changes when storage events are unavailable');
  assert.match(html, /type:\s*'ar-presence'/, 'ArrowHead should publish AR user position and orientation to websocket peers');
  assert.match(html, /worldToLatLngAffine\(/, 'ArrowHead should project LineSmith world coordinates to lat\/lon for AR cursor overlays');
  assert.match(html, /latLngToWorldAffine\(/, 'ArrowHead should convert GPS lat\/lon into state-plane coordinates before publishing presence');

  assert.match(html, /const\s+targetBearingRad\s*=\s*Math\.atan2\(east, north\);/, 'ArrowHead should compute per-point bearing from ENU deltas');
  assert.match(html, /const\s+relativeBearingRad\s*=\s*computeRelativeBearingRad\(targetBearingRad, state\.headingRad\);/, 'ArrowHead should align point bearing with camera heading using shared projection math');
  assert.match(html, /const\s+targetElevationRad\s*=\s*Math\.atan2\(up, horizontalDistance\);/, 'ArrowHead should compute vertical angle from phone to point');
  assert.match(html, /const\s+forwardDistance\s*=\s*computeForwardDistanceMeters\(horizontalDistance, relativeBearingRad\) \* Math\.cos\(relativeElevationRad\);/, 'ArrowHead should use heading-aware forward distance so behind-camera points are culled');
  assert.match(html, /const\s+xFromBearing\s*=\s*\(Math\.tan\(relativeBearingRad\) \/ Math\.tan\(horizontalFov \* 0\.5\)\)/, 'ArrowHead should project horizontal screen offset from bearing');
  assert.match(html, /const\s+yFromElevation\s*=\s*\(Math\.tan\(relativeElevationRad\) \/ Math\.tan\(verticalFov \* 0\.5\)\)/, 'ArrowHead should project vertical screen offset from elevation angle');
  assert.match(html, /const\s+xRotated\s*=\s*xFromBearing\s*\*\s*cosRoll\s*-\s*yFromElevation\s*\*\s*sinRoll;/, 'ArrowHead should apply roll compensation to screen coordinates');
  assert.match(html, /const\s+ON_TARGET_CENTER_FRACTION\s*=\s*0\.1;/, 'ArrowHead should define a center-target fraction matching the middle 10% of the feed');
  assert.match(html, /const\s+centerHalfWidth\s*=\s*canvas\.width\s*\*\s*ON_TARGET_CENTER_FRACTION\s*\*\s*0\.5;/, 'ArrowHead should compute horizontal center-zone bounds');
  assert.match(html, /const\s+centerHalfHeight\s*=\s*canvas\.height\s*\*\s*ON_TARGET_CENTER_FRACTION\s*\*\s*0\.5;/, 'ArrowHead should compute vertical center-zone bounds');
  assert.match(html, /ctx\.arc\(onTargetPoint\.x, onTargetPoint\.y, ringRadius, 0, Math\.PI \* 2\);/, 'ArrowHead should draw an on-target circle around the centered point');
  assert.match(html, /On target • \$\{onTargetPoint\.distanceM\.toFixed\(1\)\} m \(\$\{distanceFeet\.toFixed\(1\)\} ft\)/, 'ArrowHead should overlay on-target distance guidance text');
});
