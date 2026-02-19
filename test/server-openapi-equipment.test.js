import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI spec documents equipment delete endpoint', async () => {
  const raw = await readFile(OPENAPI_PATH, 'utf8');
  const spec = JSON.parse(raw);

  const equipmentPath = spec?.paths?.['/api/equipment'];
  assert.ok(equipmentPath, 'spec should include /api/equipment path');
  assert.ok(equipmentPath.get, 'spec should include GET /api/equipment');
  assert.ok(equipmentPath.post, 'spec should include POST /api/equipment');
  assert.ok(equipmentPath.delete, 'spec should include DELETE /api/equipment');
});
