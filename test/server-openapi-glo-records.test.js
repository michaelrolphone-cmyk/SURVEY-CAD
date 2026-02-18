import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI spec documents GLO records endpoint', async () => {
  const raw = await readFile(OPENAPI_PATH, 'utf8');
  const spec = JSON.parse(raw);

  const pathItem = spec?.paths?.['/api/glo-records'];
  assert.ok(pathItem, 'spec should include /api/glo-records path');
  assert.ok(pathItem.get, 'spec should include GET /api/glo-records operation');
  assert.ok(spec?.components?.schemas?.GloRecordsResponse, 'spec should include GloRecordsResponse schema');
});
