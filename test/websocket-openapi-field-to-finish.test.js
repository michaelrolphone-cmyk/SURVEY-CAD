import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('websocket spec documents LineForge field-to-finish update broadcast', async () => {
  const raw = await readFile(new URL('../docs/websocket.json', import.meta.url), 'utf8');
  const spec = JSON.parse(raw);

  assert.ok(spec?.components?.schemas?.LineforgeFieldToFinishUpdatedMessage, 'websocket spec should define field-to-finish update message schema');

  const serverUnion = spec?.components?.schemas?.LineForgeServerMessage;
  const refs = (serverUnion?.oneOf || []).map((entry) => entry?.$ref);
  assert.ok(refs.includes('#/components/schemas/LineforgeFieldToFinishUpdatedMessage'), 'lineforge server message union should include field-to-finish update payload');
});
