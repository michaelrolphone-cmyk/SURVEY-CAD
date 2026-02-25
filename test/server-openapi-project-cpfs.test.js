import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const specPath = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI documents CP&F field-book star metadata', async () => {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));

  const listPath = spec?.paths?.['/api/projects/{projectId}/cpfs'];
  const overwriteParam = listPath?.post?.parameters?.find((entry) => entry?.name === 'overwrite' && entry?.in === 'query');

  const mutation = spec?.components?.schemas?.ProjectCpfMutationRequest;
  const summary = spec?.components?.schemas?.ProjectCpfSummary;
  const detail = spec?.components?.schemas?.ProjectCpf;
  const batch = spec?.components?.schemas?.ProjectCpfBatchUpsertRequest;

  assert.equal(overwriteParam?.schema?.type, 'boolean');
  assert.equal(mutation?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(summary?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(detail?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(batch?.properties?.overwrite?.type, 'boolean');
  assert.ok(summary?.required?.includes('starredInFieldBook'));
  assert.ok(detail?.required?.includes('starredInFieldBook'));
});
