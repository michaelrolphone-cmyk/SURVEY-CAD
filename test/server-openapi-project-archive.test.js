import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const openApiPath = new URL('../docs/server.api.json', import.meta.url);

test('OpenAPI describes project archive endpoint', async () => {
  const raw = await readFile(openApiPath, 'utf8');
  const spec = JSON.parse(raw);

  const archivePath = spec?.paths?.['/api/projects/{projectId}/archive'];
  assert.ok(archivePath?.post, 'OpenAPI should declare POST /api/projects/{projectId}/archive');
  assert.equal(archivePath.post.operationId, 'archiveProjectDelete');
  assert.ok(Array.isArray(archivePath.post.parameters));
  assert.ok(archivePath.post.parameters.some((parameter) => parameter?.$ref === '#/components/parameters/ProjectIdParam'));

  const successSchema = archivePath.post.responses?.['201']?.content?.['application/json']?.schema;
  assert.equal(successSchema?.properties?.archived?.type, 'boolean');
  assert.equal(successSchema?.properties?.snapshotEntryCount?.type, 'integer');
  assert.equal(successSchema?.properties?.redisEntryCount?.type, 'integer');
});
