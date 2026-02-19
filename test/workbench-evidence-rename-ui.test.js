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

test('WORKBENCH evidence views render and hydrate drawing and point-file thumbnails', async () => {
  const html = await readFile(workbenchPath, 'utf8');

  assert.match(html, /function classifyEvidenceThumbnail\(ev = \{\}\) \{[\s\S]*project-source:drawing:[\s\S]*project-source:point-file:/, 'Evidence should classify drawing and point-file sources from project tags');
  assert.match(html, /async function resolveEvidenceThumbnail\(ev = \{\}\) \{[\s\S]*apiRequest\('GET', refUrl\)[\s\S]*renderLineworkThumbnailDataUrl[\s\S]*renderPointFileThumbnailDataUrl/, 'Thumbnail resolver should fetch project sources and render both drawing and point-file previews');
  assert.match(html, /data-evidence-thumb-id="\$\{esc\(ev\.id\)\}"/, 'Evidence rows should expose thumbnail image placeholders keyed by evidence id');
  assert.match(html, /if \(state\.tab === "evidence"\)\{[\s\S]*hydrateEvidenceThumbnails\(elMain\);[\s\S]*\}/, 'Evidence tab should hydrate thumbnails after rendering');
  assert.match(html, /if \(state\.tab === "outputs"\)\{[\s\S]*hydrateEvidenceThumbnails\(elMain\);[\s\S]*\}/, 'Outputs tab should hydrate evidence register thumbnails after rendering');
});
