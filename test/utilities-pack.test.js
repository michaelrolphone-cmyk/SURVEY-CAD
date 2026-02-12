import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const utilitiesPackHtmlPath = new URL('../UtilitiesPack.html', import.meta.url);

test('UtilitiesPack loads power utilities through generic API source filtering', async () => {
  const html = await readFile(utilitiesPackHtmlPath, 'utf8');

  assert.match(html, /loadUtilitiesByAddress\(address,\s*\{\s*outSR:\s*state\.outSR,\s*sources:\s*\['power'\]\s*\}\)/);
  assert.match(html, /id="exportButton"[\s\S]*aria-label="Export power CSV"/);
  assert.match(html, /class="iconFile"/);
  assert.match(html, /class="iconDownload"/);
  assert.match(html, /<span class="iconSubtitle">Export<\/span>/);
  assert.match(html, /utility\.source\s*\|\|\s*''/);
});

test('UtilitiesPack CSV export matches name,northing,easting,elevation,code,description format', async () => {
  const html = await readFile(utilitiesPackHtmlPath, 'utf8');

  assert.match(html, /\['name', 'northing', 'easting', 'elevation', 'code', 'description'\]/);
  assert.match(html, /utility\.name \|\| `POWER_\$\{index \+ 1\}`/);
  assert.match(html, /Number\(projected\.north \|\| 0\)\.toFixed\(3\)/);
  assert.match(html, /Number\(projected\.east \|\| 0\)\.toFixed\(3\)/);
  assert.match(html, /utility\.provider \|\| utility\.source \|\| ''/);
});
