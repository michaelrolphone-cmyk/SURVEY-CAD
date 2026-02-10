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
  assert.match(html, /Number\(p\.z\) === 0 \? state\.userAltFeet : Number\(p\.z\)/, 'ArrowHead should replace zero-elevation points with current phone elevation');
  assert.match(html, /const\s+lat\s*=\s*georef\.lat\.ax\s*\*\s*x\s*\+\s*georef\.lat\.by\s*\*\s*y\s*\+\s*georef\.lat\.c;/, 'ArrowHead should use LineSmith georeference translation for x\/y to lat\/lon conversion');

  assert.match(html, /import\s+\{\s*deriveDevicePoseRadians,\s*normalizeRadians\s*\}\s+from\s+"\.\/src\/arrowhead-math\.js";/, 'ArrowHead should use shared orientation math helpers');
  assert.match(html, /const\s+pose\s*=\s*deriveDevicePoseRadians\(event, currentScreenAngle\(\), state\.headingOffsetRad\);/, 'ArrowHead should derive heading and tilt from the normalized orientation helper');
  assert.match(html, /const\s+targetBearingRad\s*=\s*Math\.atan2\(east, north\);/, 'ArrowHead should compute per-point bearing from ENU deltas');
  assert.match(html, /const\s+relativeBearingRad\s*=\s*normalizeRadians\(targetBearingRad - state\.headingRad\);/, 'ArrowHead should align point bearing with camera heading');
  assert.match(html, /const\s+targetElevationRad\s*=\s*Math\.atan2\(up, horizontalDistance\);/, 'ArrowHead should compute vertical angle from phone to point');
  assert.match(html, /const\s+xFromBearing\s*=\s*\(Math\.tan\(relativeBearingRad\) \/ Math\.tan\(horizontalFov \* 0\.5\)\)/, 'ArrowHead should project horizontal screen offset from bearing');
  assert.match(html, /const\s+yFromElevation\s*=\s*\(Math\.tan\(relativeElevationRad\) \/ Math\.tan\(verticalFov \* 0\.5\)\)/, 'ArrowHead should project vertical screen offset from elevation angle');
  assert.match(html, /const\s+xRotated\s*=\s*xFromBearing\s*\*\s*cosRoll\s*-\s*yFromElevation\s*\*\s*sinRoll;/, 'ArrowHead should apply roll compensation to screen coordinates');
});
