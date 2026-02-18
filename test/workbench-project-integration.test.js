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
});
