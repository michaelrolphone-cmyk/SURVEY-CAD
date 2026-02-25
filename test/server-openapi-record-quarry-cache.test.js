import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI documents coordinate-only address RecordQuarry cache behavior', async () => {
  const spec = JSON.parse(await readFile(OPENAPI_PATH, 'utf8'));

  const addressPath = spec?.paths?.['/api/record-quarry-cache'];
  assert.ok(addressPath?.get, 'OpenAPI should define GET /api/record-quarry-cache');
  assert.ok(addressPath?.put, 'OpenAPI should define PUT /api/record-quarry-cache');
  assert.match(
    String(addressPath.put.description || ''),
    /coordinate-only lookup summaries/i,
    'OpenAPI should describe coordinate-only persistence for address cache saves',
  );

  const cacheInput = spec?.components?.schemas?.RecordQuarryCacheInput;
  assert.ok(cacheInput, 'OpenAPI should define RecordQuarryCacheInput schema');
  assert.match(
    String(cacheInput.description || ''),
    /Address-keyed saves persist only coordinate\/geocode summary fields/i,
    'OpenAPI should describe address-keyed summary payload behavior in input schema docs',
  );

  const cacheRecord = spec?.components?.schemas?.RecordQuarryCacheRecord;
  assert.ok(cacheRecord, 'OpenAPI should define RecordQuarryCacheRecord schema');
  assert.match(
    String(cacheRecord.description || ''),
    /Address-keyed records return coordinate\/geocode summaries/i,
    'OpenAPI should describe summary behavior for persisted address cache records',
  );
});
