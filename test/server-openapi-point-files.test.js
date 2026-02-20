import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server OpenAPI spec documents project point file CRUD endpoints', async () => {
  const raw = await readFile(new URL('../docs/server.api.json', import.meta.url), 'utf8');
  const spec = JSON.parse(raw);

  const collectionPath = spec?.paths?.['/api/projects/{projectId}/point-files'];
  assert.ok(collectionPath, 'spec should include collection point file path');
  assert.ok(collectionPath.get, 'spec should include GET on collection point file path');
  assert.ok(collectionPath.post, 'spec should include POST on collection point file path');

  const itemPath = spec?.paths?.['/api/projects/{projectId}/point-files/{pointFileId}'];
  assert.ok(itemPath, 'spec should include item point file path');
  assert.ok(itemPath.get, 'spec should include GET on item point file path');
  assert.ok(itemPath.put, 'spec should include PUT on item point file path');
  assert.ok(itemPath.patch, 'spec should include PATCH on item point file path');
  assert.ok(itemPath.delete, 'spec should include DELETE on item point file path');

  const getParameters = itemPath.get.parameters || [];
  assert.ok(getParameters.some((parameter) => parameter?.name === 'versionId' && parameter?.in === 'query'), 'GET point file should document optional versionId query parameter');

  assert.ok(spec?.components?.schemas?.ProjectPointFileMutationRequest, 'spec should include point file mutation request schema');
  assert.ok(spec?.components?.schemas?.ProjectPointFileResponse, 'spec should include point file response schema');
});
