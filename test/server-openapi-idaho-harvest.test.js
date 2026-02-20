import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI spec documents Idaho harvest worker endpoints', async () => {
  const raw = await readFile(OPENAPI_PATH, 'utf8');
  const spec = JSON.parse(raw);

  assert.ok(spec?.paths?.['/api/idaho-harvest/status']?.get);
  assert.ok(spec?.paths?.['/api/idaho-harvest/start']?.post);
  assert.ok(spec?.paths?.['/api/idaho-harvest/stop']?.post);

  const schema = spec?.components?.schemas?.IdahoHarvestWorkerStatus;
  assert.ok(schema);
  assert.equal(schema?.properties?.restartCount?.type, 'integer');
});
