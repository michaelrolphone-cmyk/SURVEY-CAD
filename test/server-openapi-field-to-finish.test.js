import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server OpenAPI spec documents shared field-to-finish CRUD endpoint', async () => {
  const raw = await readFile(new URL('../docs/server.api.json', import.meta.url), 'utf8');
  const spec = JSON.parse(raw);

  const pathItem = spec?.paths?.['/api/field-to-finish'];
  assert.ok(pathItem, 'spec should include /api/field-to-finish path');
  assert.ok(pathItem.get, 'spec should include GET /api/field-to-finish');
  assert.ok(pathItem.put, 'spec should include PUT /api/field-to-finish');
  assert.ok(pathItem.delete, 'spec should include DELETE /api/field-to-finish');

  assert.ok(spec?.components?.schemas?.FieldToFinishSettings, 'spec should include FieldToFinishSettings schema');
  assert.ok(spec?.components?.schemas?.FieldToFinishSettingsMutationRequest, 'spec should include FieldToFinishSettingsMutationRequest schema');
});
