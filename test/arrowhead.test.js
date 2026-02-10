import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ArrowHead mobile AR app reads LineSmith payload and uses camera + motion + location sensors', async () => {
  const html = await readFile(new URL('../ArrowHead.html', import.meta.url), 'utf8');

  assert.match(html, /const\s+ARROWHEAD_IMPORT_STORAGE_KEY\s*=\s*'lineSmithArrowHeadImport'/, 'ArrowHead should consume the LineSmith handoff storage key');
  assert.match(html, /navigator\.mediaDevices\.getUserMedia\(/, 'ArrowHead should request camera access for AR video feed');
  assert.match(html, /navigator\.geolocation\.watchPosition\(/, 'ArrowHead should watch GPS updates for world alignment');
  assert.match(html, /window\.addEventListener\('deviceorientation'/, 'ArrowHead should subscribe to orientation sensor updates');
  assert.match(html, /window\.addEventListener\('devicemotion'/, 'ArrowHead should subscribe to motion sensor updates');
  assert.match(html, /Number\(p\.z\) === 0 \? state\.userAltFeet : Number\(p\.z\)/, 'ArrowHead should replace zero-elevation points with current phone elevation');
  assert.match(html, /const\s+lat\s*=\s*georef\.lat\.ax\s*\*\s*x\s*\+\s*georef\.lat\.by\s*\*\s*y\s*\+\s*georef\.lat\.c;/, 'ArrowHead should use LineSmith georeference translation for x\/y to lat\/lon conversion');
});
