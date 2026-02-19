import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const OPENAPI_PATH = new URL('../docs/workbench.api.json', import.meta.url);

test('Workbench OpenAPI documents attachmentName in EvidencePatch', async () => {
  const raw = await readFile(OPENAPI_PATH, 'utf8');
  const spec = JSON.parse(raw);

  const attachmentName = spec?.components?.schemas?.EvidencePatch?.properties?.attachmentName;
  assert.ok(attachmentName, 'EvidencePatch should include attachmentName property');
  assert.equal(attachmentName.type, 'string');
});
