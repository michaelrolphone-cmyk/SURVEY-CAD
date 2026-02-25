import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const specPath = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI documents project plats star metadata and endpoints', async () => {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));

  const listPath = spec?.paths?.['/api/projects/{projectId}/plats'];
  const itemPath = spec?.paths?.['/api/projects/{projectId}/plats/{platId}'];
  assert.ok(listPath?.get);
  assert.ok(itemPath?.patch);

  const mutation = spec?.components?.schemas?.ProjectPlatMutationRequest;
  const summary = spec?.components?.schemas?.ProjectPlatSummary;
  const detail = spec?.components?.schemas?.ProjectPlat;

  assert.equal(mutation?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(summary?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(detail?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(mutation?.properties?.subdivisionName?.type, 'string');
  assert.equal(summary?.properties?.subdivisionName?.type, 'string');
  assert.equal(detail?.properties?.subdivisionName?.type, 'string');
  assert.ok(summary?.required?.includes('starredInFieldBook'));
  assert.ok(detail?.required?.includes('starredInFieldBook'));
});
