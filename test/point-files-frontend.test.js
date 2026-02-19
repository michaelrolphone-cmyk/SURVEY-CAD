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


test('PointForge renders code-group explorer with thumbnails and BoundaryLab handoff', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');
  assert.match(html, /Point Groups by Code/, 'PointForge should render a point-group explorer section.');
  assert.match(html, /<h2><span class="sig"><\/span> Spatial HUD<\/h2>[\s\S]*<section class="pointGroupExplorer"[\s\S]*<div id="map">/, 'PointForge should render the point-group explorer above the map in Spatial HUD.');
  assert.match(html, /function\s+buildPointGroupsFromRecords\(/, 'PointForge should build visual point groups from output records.');
  assert.match(html, /function\s+buildLineworkThumbnailDataUrl\(/, 'PointForge should generate linework thumbnail previews for grouped codes.');
  assert.match(html, /data:image\/svg\+xml;utf8,\$\{encodeURIComponent\(svg\)\}/, 'PointForge thumbnails should URL-encode SVG data URLs so preview <img> tags remain valid HTML.');
  assert.match(html, /function\s+parseFieldToFinishDirective\(/, 'PointForge should parse field-to-finish directives to identify linework groupings.');
  assert.match(html, /function\s+buildBoundaryLabCsvFromSegments\(/, 'PointForge should build BoundaryLab handoff payloads from selected groups/subgroups.');
  assert.match(html, /openLinkedApp\(`\/BoundaryLab\.html\?source=pointforge/, 'PointForge group explorer should offer opening selected linework in BoundaryLab.');
});
