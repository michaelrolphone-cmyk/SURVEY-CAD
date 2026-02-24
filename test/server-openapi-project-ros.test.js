import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const specPath = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI documents project ROS star metadata and endpoints', async () => {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));

  const listPath = spec?.paths?.['/api/projects/{projectId}/ros'];
  const itemPath = spec?.paths?.['/api/projects/{projectId}/ros/{rosId}'];
  assert.ok(listPath?.get);
  assert.ok(itemPath?.patch);

  const mutation = spec?.components?.schemas?.ProjectRosMutationRequest;
  const summary = spec?.components?.schemas?.ProjectRosSummary;
  const detail = spec?.components?.schemas?.ProjectRos;

  assert.equal(mutation?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(summary?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(detail?.properties?.starredInFieldBook?.type, 'boolean');
  assert.ok(summary?.required?.includes('starredInFieldBook'));
  assert.ok(detail?.required?.includes('starredInFieldBook'));
});
