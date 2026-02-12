import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const utilitiesPackHtmlPath = new URL('../UtilitiesPack.html', import.meta.url);

test('UtilitiesPack loads power utilities through generic API source filtering', async () => {
  const html = await readFile(utilitiesPackHtmlPath, 'utf8');

  assert.match(html, /loadUtilitiesByAddress\(address,\s*\{\s*outSR:\s*state\.outSR,\s*sources:\s*\['power'\]\s*\}\)/);
  assert.match(html, /Export Power CSV/);
  assert.match(html, /utility\.source\s*\|\|\s*''/);
});

test('UtilitiesPack CSV export includes state-plane coordinates', async () => {
  const html = await readFile(utilitiesPackHtmlPath, 'utf8');

  assert.match(html, /\['id', 'source', 'provider', 'code', 'name', 'lon', 'lat', 'east', 'north', 'outSR'\]/);
  assert.match(html, /Number\(projected\.east \|\| 0\)\.toFixed\(3\)/);
  assert.match(html, /Number\(projected\.north \|\| 0\)\.toFixed\(3\)/);
});
