import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.resolve(__dirname, '..', 'src', 'server.js');

test('server includes project workbench traverse API routes', async () => {
  const src = await readFile(serverPath, 'utf8');
  assert.match(src, /workbench\(\?:\\\/\(link\|casefile\|sources\|sync\|traverses\(\?:\\\/\[\^\/\]\+\)\?\)\)\?/);
  assert.match(src, /req\.method === 'GET' && action === 'traverses'/);
  assert.match(src, /req\.method === 'GET' && action\.startsWith\('traverses\/'\) && traverseId/);
  assert.match(src, /req\.method === 'POST' && action === 'traverses'/);
});

test('project traverse save duplicates linked casefile when no casefileId is provided', async () => {
  const src = await readFile(serverPath, 'utf8');
  assert.match(src, /getProjectWorkbenchLink\(localStorageSyncStore, projectId\)/);
  assert.match(src, /bew\.store\.duplicateCasefile\(linkedCasefileId, \{ name \}\)/);
});
