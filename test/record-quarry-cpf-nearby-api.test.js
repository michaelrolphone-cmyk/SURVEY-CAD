import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('server exposes RecordQuarry CP&F nearby endpoint with coordinate validation', async () => {
  const serverSource = await fs.readFile(new URL('../src/server.js', import.meta.url), 'utf8');

  assert.match(serverSource, /urlObj\.pathname === '\/api\/recordquarry\/cpf\/nearby'/, 'Server should expose /api/recordquarry/cpf/nearby route.');
  assert.match(serverSource, /lon and lat query parameters are required\./, 'Server should require lon/lat query params for CP&F nearby route.');
  assert.match(serverSource, /queryAdaCpfRecordsNearPoint\(\{ lon, lat, maxMeters, outSR: inSR \}\)/, 'Server should run server-side CP&F query for nearby endpoint.');
});
