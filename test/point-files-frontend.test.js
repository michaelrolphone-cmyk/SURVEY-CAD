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
  assert.match(html, /async function\s+renameResourceFromEvidenceDesk\(/, 'EvidenceDesk should include a rename helper for project resources');
  assert.match(html, /fetch\(buildProjectPointFileApiUrl\(projectId, pointFileId\),\s*\{[\s\S]*method:\s*'PATCH'[\s\S]*pointFileName:\s*nextTitle[\s\S]*pointFileState:\s*currentState/, 'EvidenceDesk should rename point files through PATCH point-file API while preserving state');
  assert.match(html, /renamePointFileButton\.textContent\s*=\s*'Rename'/, 'EvidenceDesk point-file rows should expose a Rename button');
  assert.match(html, /const\s+isPointFileFormat\s*=\s*pointFileFormat\s*===\s*'csv'\s*\|\|\s*pointFileFormat\s*===\s*'txt';/, 'EvidenceDesk should only launch PointForge for point-file formats.');
  assert.match(html, /const\s+canLaunchPointForge\s*=\s*folder\.key\s*===\s*'point-files'[\s\S]*isPointFileFormat/, 'EvidenceDesk should gate PointForge launch behavior behind point-file format checks.');
});

test('EvidenceDesk uses project drawing CRUD API endpoints for drawing list and launch hydration', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');
  assert.match(html, /async function\s+syncProjectDrawingsFromApi\(/, 'EvidenceDesk should sync drawings from API');
  assert.match(html, /reference:\s*\{[\s\S]*type:\s*'project-drawing'/, 'EvidenceDesk drawing rows should be API-backed resources');
  assert.match(html, /fetch\(buildProjectDrawingApiUrl\(projectContext\.activeProjectId\)\)/, 'EvidenceDesk should list drawings via project drawing collection endpoint');
  assert.match(html, /fetch\(buildProjectDrawingApiUrl\(projectId, drawingId\)\)/, 'EvidenceDesk should fetch drawing record by id before launch');
  assert.match(html, /localStorage\.setItem\(storageKey, JSON\.stringify\(drawing\)\)/, 'EvidenceDesk should hydrate localStorage with API drawing payload for LineSmith import');
  assert.match(html, /fetch\(buildProjectDrawingApiUrl\(projectId, drawingId\),\s*\{[\s\S]*method:\s*'PATCH'[\s\S]*drawingName:\s*nextTitle[\s\S]*drawingState:\s*currentState/, 'EvidenceDesk should rename drawings through PATCH drawing API while preserving state');
  assert.match(html, /renameDrawingButton\.textContent\s*=\s*'Rename'/, 'EvidenceDesk drawing rows should expose a Rename button');
  assert.match(html, /renameResourceTitle\(projectContext\?\.projectFile, folder\?\.key, entry\?\.id, nextTitle\)/, 'EvidenceDesk should rename non-API resources in project-file index state');
});

test('EvidenceDesk file rows prioritize configured names and truncate actual file names', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');
  assert.match(html, /\.file-name-configured\s*\{[\s\S]*color:\s*#f8fafc;[\s\S]*font-weight:\s*600;/, 'EvidenceDesk should render configured names in brighter text.');
  assert.match(html, /\.file-name-actual\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/, 'EvidenceDesk should truncate long actual file names with ellipsis.');
  assert.match(html, /const\s+leadingIcon\s*=\s*isPdfResource\s*\?\s*'<span class="pdf-preview-icon" aria-label="PDF preview icon">PDF<\/span>'\s*:\s*'<span class="icon">📄<\/span>';/, 'EvidenceDesk should render a visible PDF preview icon for PDF resources.');
  assert.match(html, /<span class="file-name-configured">\$\{configuredFileName\}<\/span><span class="file-name-actual" title="\$\{actualFileName\}">— \$\{actualFileName\}<\/span>/, 'EvidenceDesk should display configured file name first and actual file name after it.');
});

test('EvidenceDesk opens PDFs in dedicated browser windows', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');
  assert.match(html, /function\s+openPdfInNewWindow\(pdfUrl\)\s*\{[\s\S]*window\.open\(pdfUrl,\s*'_blank',\s*'popup=yes,width=1200,height=900,noopener,noreferrer'\)/, 'EvidenceDesk should open PDFs in a popup-sized browser window rather than generic tab behavior.');
  assert.match(html, /openPdfInNewWindow\(pdfUrl\);/, 'EvidenceDesk CP&F open actions should route through shared PDF window helper.');
  assert.match(html, /if\s*\(isServerPdf\)\s*\{[\s\S]*openPdfInNewWindow\(downloadUrl\);/, 'EvidenceDesk uploaded PDF resources should also open in a new browser window.');
});


test('PointForge renders code-group explorer with thumbnails and BoundaryLab handoff', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');
  assert.match(html, /Point Groups by Code/, 'PointForge should render a point-group explorer section.');
  assert.match(html, /<h2><span class="sig"><\/span> Spatial HUD<\/h2>[\s\S]*<section class="pointGroupExplorer"[\s\S]*<div id="map">/, 'PointForge should render the point-group explorer above the map in Spatial HUD.');
  assert.match(html, /function\s+buildPointGroupsFromRecords\(/, 'PointForge should build visual point groups from output records.');
  assert.match(html, /function\s+getPointGroupCodeToken\(code\s*=\s*""\)\s*\{[\s\S]*split\(/, 'PointForge should derive point-group keys from the first code token before field-to-finish commands/notes.');
  assert.match(html, /const\s+codeToken\s*=\s*getPointGroupCodeToken\(codeRaw\);[\s\S]*const\s+codeKey\s*=\s*codeToken\s*\|\|\s*"UNCODED";/, 'PointForge code grouping should use the first code token and fallback uncoded records.');
  assert.match(html, /function\s+buildLineworkThumbnailDataUrl\(/, 'PointForge should generate linework thumbnail previews for grouped codes.');
  assert.match(html, /data:image\/svg\+xml;utf8,\$\{encodeURIComponent\(svg\)\}/, 'PointForge thumbnails should URL-encode SVG data URLs so preview <img> tags remain valid HTML.');
  assert.match(html, /function\s+parseFieldToFinishDirective\(/, 'PointForge should parse field-to-finish directives to identify linework groupings.');
  assert.match(html, /function\s+buildBoundaryLabCsvFromSegments\(/, 'PointForge should build BoundaryLab handoff payloads from selected groups/subgroups.');
  assert.match(html, /openLinkedApp\(`\/BoundaryLab\.html\?source=pointforge/, 'PointForge group explorer should offer opening selected linework in BoundaryLab.');
});


test('PointForge auto-focuses transformed point editor accordion and hides stats/log panels', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');
  assert.match(html, /<section class="leftStack">[\s\S]*<div class="localizationPanel">[\s\S]*<section class="panel" id="ingestPanel">/, 'PointForge should place localization controls above the ingest console panel.');
  assert.match(html, /<section class="leftStack">[\s\S]*<div class="accordionStack">[\s\S]*<section class="panel" id="ingestPanel">[\s\S]*<section class="panel outputArea" id="outputPanel">/, 'PointForge should place ingest and output panels in a dedicated accordion stack below localization controls.');
  assert.match(html, /\.accordionStack\{\s*position:relative;\s*min-height:\s*780px;\s*\}/, 'PointForge should anchor accordion overlays inside a relative accordion stack container.');
  assert.match(html, /#outputPanel\{[\s\S]*position:absolute;[\s\S]*opacity:0;[\s\S]*transform:\s*translateX\(24px\);/, 'PointForge should keep output panel hidden and offset until accordion output mode activates.');
  assert.match(html, /main\.pointEditorFocusOutput\s+#outputPanel\{[\s\S]*opacity:1;[\s\S]*left:\s*56px;/, 'PointForge should slide output panel in over input points when output accordion is active.');
  assert.match(html, /main\.pointEditorFocusOutput\s+#ingestPanel\s*\{[\s\S]*width:56px;/, 'PointForge should collapse ingest panel to a narrow accordion rail when output is shown.');
  assert.match(html, /main\.pointEditorFocusInput\s+#outputPanel\s*\{[\s\S]*width:56px;/, 'PointForge should keep output as a narrow rail when input stream is active so users can switch back.');
  assert.match(html, /main\.pointEditorFocusInput\s+#outputPanel\s*\.panelhead\s+h2\{[\s\S]*writing-mode:vertical-lr;/, 'PointForge should display output rail label vertically when input stream is expanded.');
  assert.match(html, /function\s+activatePointEditorOutputAccordion\(\)\s*\{[\s\S]*setPointEditorView\(true\);[\s\S]*setPointEditorAccordionMode\("output"\);/, 'PointForge should provide helper that auto-focuses transformed output in point editor mode.');
  assert.match(html, /function\s+setPointEditorAccordionMode\(mode\s*=\s*"input"\)\s*\{[\s\S]*classList\.toggle\("pointEditorFocusOutput",\s*outputFocused\);[\s\S]*classList\.toggle\("pointEditorFocusInput",\s*inputFocused\);/, 'PointForge accordion mode should support explicit input/output rail classes for bidirectional switching.');
  assert.match(html, /elIn\.addEventListener\("paste",\s*\(\)=>\{[\s\S]*activatePointEditorOutputAccordion\(\);/, 'PointForge should auto-open transformed point-editor view when points are pasted.');
  assert.match(html, /elFile\.addEventListener\("change",\s*async\s*\(e\)=>\{[\s\S]*activatePointEditorOutputAccordion\(\);/, 'PointForge should auto-open transformed point-editor view when files are uploaded.');
  assert.match(html, /\.pointsTableWrap\{[\s\S]*--point-table-visible-line-items:\s*25;[\s\S]*max-height:\s*calc\(\(var\(--point-table-visible-line-items\)\s*\+\s*1\)\s*\*\s*var\(--point-table-line-item-height\)\);/, 'PointForge point-editor tables should cap visible height to 25 line items plus header.');
  assert.doesNotMatch(html, /<div class="stats"/, 'PointForge should remove ingest stats panel below localization controls.');
  assert.match(html, /<div class="log" id="log"><\/div>/, 'PointForge should keep a log node for existing logic while hiding the visible logs section.');
  assert.match(html, /\.log\{\s*display:none;\s*\}/, 'PointForge should hide ingest logs section below localization controls.');
});
