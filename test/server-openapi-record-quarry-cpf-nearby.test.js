import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI documents RecordQuarry CP&F nearby endpoint', async () => {
  const spec = JSON.parse(await readFile(OPENAPI_PATH, 'utf8'));
  const nearby = spec?.paths?.['/api/recordquarry/cpf/nearby'];
  assert.ok(nearby?.get, 'OpenAPI should define GET /api/recordquarry/cpf/nearby');
  assert.match(String(nearby.get.description || ''), /server-side layer discovery/i);

  const responseSchemaRef = nearby.get.responses?.['200']?.content?.['application/json']?.schema?.$ref;
  assert.equal(responseSchemaRef, '#/components/schemas/RecordQuarryCpfNearbyResponse');

  const recordSchema = spec?.components?.schemas?.RecordQuarryCpfNearbyRecord;
  assert.ok(recordSchema, 'OpenAPI should define RecordQuarryCpfNearbyRecord schema');
  assert.ok(recordSchema.properties?.links, 'CP&F nearby record should include links array');
});
