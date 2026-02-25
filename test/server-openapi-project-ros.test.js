import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const specPath = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI documents project ROS star metadata and endpoints', async () => {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));

  const listPath = spec?.paths?.['/api/projects/{projectId}/ros'];
  const itemPath = spec?.paths?.['/api/projects/{projectId}/ros/{rosId}'];
  const overwriteParam = listPath?.post?.parameters?.find((entry) => entry?.name === 'overwrite' && entry?.in === 'query');
  assert.ok(listPath?.get);
  assert.ok(itemPath?.patch);

  const mutation = spec?.components?.schemas?.ProjectRosMutationRequest;
  const summary = spec?.components?.schemas?.ProjectRosSummary;
  const detail = spec?.components?.schemas?.ProjectRos;
  const batch = spec?.components?.schemas?.ProjectRosBatchUpsertRequest;

  assert.equal(overwriteParam?.schema?.type, 'boolean');
  assert.equal(mutation?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(summary?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(detail?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(mutation?.properties?.metadata?.type, 'object');
  assert.equal(summary?.properties?.metadata?.type, 'object');
  assert.equal(detail?.properties?.metadata?.type, 'object');
  assert.equal(mutation?.properties?.thumbnailUrl?.type, 'string');
  assert.equal(summary?.properties?.thumbnailUrl?.type, 'string');
  assert.equal(detail?.properties?.thumbnailUrl?.type, 'string');
  assert.equal(batch?.properties?.overwrite?.type, 'boolean');
  assert.ok(summary?.required?.includes('starredInFieldBook'));
  assert.ok(detail?.required?.includes('starredInFieldBook'));
});
