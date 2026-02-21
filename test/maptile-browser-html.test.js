import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appHtmlPath = path.resolve(__dirname, '..', 'MapTileBrowser.html');

test('MapTileBrowser app uses Leaflet and maptile APIs', async () => {
  const html = await fs.readFile(appHtmlPath, 'utf8');
  assert.match(html, /unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css/i);
  assert.match(html, /unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js/i);
  assert.match(html, /id="map"/i);
  assert.match(html, /fetch\('\/api\/maptiles'\)/i);
  assert.match(html, /\/api\/maptiles\/\$\{encodeURIComponent\(dataset\)\}\/tilejson\.json/i);
  assert.match(html, /maptileOverlayPane/i);
  assert.match(html, /const datasetPaint = \{/i);
  assert.match(html, /Drew \$\{drawnFeatures\} features across \$\{datasets\.length\} layer\(s\)\./i);
  assert.match(html, /Promise\.all\(fetchQueue\)/i);
});
