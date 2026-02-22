import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const specPath = new URL('../docs/server.api.json', import.meta.url);

test('server OpenAPI documents CP&F field-book star metadata', async () => {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));

  const mutation = spec?.components?.schemas?.ProjectCpfMutationRequest;
  const summary = spec?.components?.schemas?.ProjectCpfSummary;
  const detail = spec?.components?.schemas?.ProjectCpf;

  assert.equal(mutation?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(summary?.properties?.starredInFieldBook?.type, 'boolean');
  assert.equal(detail?.properties?.starredInFieldBook?.type, 'boolean');
  assert.ok(summary?.required?.includes('starredInFieldBook'));
  assert.ok(detail?.required?.includes('starredInFieldBook'));
});
