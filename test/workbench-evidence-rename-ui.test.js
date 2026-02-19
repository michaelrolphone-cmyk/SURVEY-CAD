import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbenchPath = path.resolve(__dirname, '..', 'WORKBENCH.html');

test('WORKBENCH Evidence Desk exposes rename-file action that uses evidence patch attachmentName', async () => {
  const html = await readFile(workbenchPath, 'utf8');

  assert.match(html, /data-act="renameAttachment"/, 'Evidence rows should include a rename attachment action button');
  assert.match(html, /async function\s+renameAttachment\(evidenceId\)\s*\{[\s\S]*api\.patchEvidence\(state\.activeId, evidenceId, \{ attachmentName: trimmedName \}\);/, 'Rename action should PATCH evidence with attachmentName');
  assert.match(html, /if \(act === "renameAttachment"\)\{ renameAttachment\(id\); return; \}/, 'Click delegation should route renameAttachment action');
});
