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

  const paramNames = new Set((pathItem.get.parameters || []).map((param) => param.name));
  assert.equal(paramNames.has('address'), true);
  assert.equal(paramNames.has('lon'), true);
  assert.equal(paramNames.has('lat'), true);

  const schema = spec?.components?.schemas?.GloRecordsResponse;
  assert.ok(schema, 'spec should include GloRecordsResponse schema');
  assert.equal(schema?.properties?.resultsUrl?.format, 'uri');
  assert.equal(schema?.properties?.location?.properties?.lon?.type, 'number');
  assert.equal(schema?.properties?.location?.properties?.lat?.type, 'number');
});
