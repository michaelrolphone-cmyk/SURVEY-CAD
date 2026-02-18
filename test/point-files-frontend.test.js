import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('PointForge uses project point file API endpoints for list/get/persist', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');
  assert.match(html, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/point-files/, 'PointForge should build project point-file API routes');
  assert.match(html, /async function\s+fetchProjectPointFiles\(/, 'PointForge should fetch project point files from API for dropdown list');
  assert.match(html, /async function\s+fetchProjectPointFile\(/, 'PointForge should fetch selected point file state from API');
  assert.match(html, /persistPointFileToApi\(/, 'PointForge should persist import\/export point files through API endpoints');
});

test('EvidenceDesk uses project point file API endpoints for point-file list and deletion', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');
  assert.match(html, /async function\s+syncProjectPointFilesFromApi\(/, 'EvidenceDesk should sync point files from API');
  assert.match(html, /reference:\s*\{[\s\S]*type:\s*'project-point-file'/, 'EvidenceDesk point-file rows should be API-backed resources');
  assert.match(html, /fetch\(buildProjectPointFileApiUrl\([^,]+,\s*pointFileId\),\s*\{ method: 'DELETE' \}\)/, 'EvidenceDesk should delete point files through API endpoint');
  assert.match(html, /pointFileState:\s*\{\s*text,\s*exportFormat:\s*'csv'\s*\}/, 'EvidenceDesk upload should post point file state payloads to API');
});

test('EvidenceDesk uses project drawing CRUD API endpoints for drawing list and launch hydration', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');
  assert.match(html, /async function\s+syncProjectDrawingsFromApi\(/, 'EvidenceDesk should sync drawings from API');
  assert.match(html, /reference:\s*\{[\s\S]*type:\s*'project-drawing'/, 'EvidenceDesk drawing rows should be API-backed resources');
  assert.match(html, /fetch\(buildProjectDrawingApiUrl\(projectContext\.activeProjectId\)\)/, 'EvidenceDesk should list drawings via project drawing collection endpoint');
  assert.match(html, /fetch\(buildProjectDrawingApiUrl\(projectId, drawingId\)\)/, 'EvidenceDesk should fetch drawing record by id before launch');
  assert.match(html, /localStorage\.setItem\(storageKey, JSON\.stringify\(drawing\)\)/, 'EvidenceDesk should hydrate localStorage with API drawing payload for LineSmith import');
});
