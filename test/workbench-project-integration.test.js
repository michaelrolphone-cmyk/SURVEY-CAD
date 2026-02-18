import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('WORKBENCH links to project workbench bootstrap API when launched with activeProjectId', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /const activeProjectId = pageParams\.get\("activeProjectId"\) \|\| pageParams\.get\("projectId"\) \|\| "";/);
  assert.match(html, /syncProjectWorkbench: \(projectId, body=\{\}\) => apiRequest\("POST",`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/workbench\/sync`/);
  assert.match(html, /const linked = await api\.syncProjectWorkbench\(activeProjectId, \{\}\);/);
  assert.match(html, /async function doOpenActiveProjectFromApi\(\)\{[\s\S]*await api\.syncProjectWorkbench\(activeProjectId, \{\}\);/);
  assert.match(html, /elImportBtn\.addEventListener\("click", \(\) => \{[\s\S]*if \(activeProjectId\) \{[\s\S]*doOpenActiveProjectFromApi\(\);[\s\S]*\}/);
  assert.match(html, /elImportBtn\.textContent = "Open Project";/);
});

test('WORKBENCH boot handles initData API failures without uncaught promise rejection', async () => {
  const html = await readFile(path.resolve(__dirname, '../WORKBENCH.html'), 'utf8');
  assert.match(html, /async function boot\(\)\{[\s\S]*try\{[\s\S]*await initData\(\);[\s\S]*\}catch\(err\)\{[\s\S]*setApiHealthState\("ERR"\);[\s\S]*toast\("Error", err\?\.message \|\| String\(err\), "bad"\);[\s\S]*render\(\);[\s\S]*\}/);
});
