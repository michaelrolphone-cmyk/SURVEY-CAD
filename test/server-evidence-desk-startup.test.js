import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SERVER_PATH = new URL('../src/server.js', import.meta.url);

test('server eagerly initializes EvidenceDesk store at startup', async () => {
  const source = await readFile(SERVER_PATH, 'utf8');

  assert.match(
    source,
    /Promise\.resolve\(\)\s*\n\s*\.then\(\(\) => resolveEvidenceDeskStore\(\)\)\s*\n\s*\.catch\(\(\) => \{\}\);/,
    'server should start evidence desk initialization during boot so startup cleanup can run',
  );
});
