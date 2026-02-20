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
  assert.match(html, /context\.setUploadStatus\(`Uploading point file \$\{currentFileNumber\}\/\$\{totalFiles\}: \$\{file\.name\}…`\)/, 'EvidenceDesk should show per-file progress while point files upload.');
  assert.match(html, /async function\s+renameResourceFromEvidenceDesk\(/, 'EvidenceDesk should include a rename helper for project resources');
  assert.match(html, /async function\s+deleteResourceFromEvidenceDesk\(/, 'EvidenceDesk should include a shared delete helper for project resources');
  assert.match(html, /function\s+moveResourceFromEvidenceDesk\(/, 'EvidenceDesk should include a move helper for drag-and-drop reorganization.');
  assert.match(html, /resource\.draggable\s*=\s*true;/, 'EvidenceDesk should mark movable rows as draggable.');
  assert.match(html, /folderRow\.addEventListener\('drop',\s*async\s*\(event\)\s*=>\s*\{[\s\S]*moveResourceFromEvidenceDesk\(/, 'EvidenceDesk folder rows should accept dropped file rows and trigger move workflow.');
  assert.match(html, /function\s+resolveServerUploadLocation\(entry,\s*fallbackFolderKey\s*=\s*''\)\s*\{[\s\S]*searchParams\.get\('folderKey'\)[\s\S]*searchParams\.get\('fileName'\)/, 'EvidenceDesk should derive server-upload folder/file metadata from download URLs when needed.');
  assert.match(html, /const\s+sendMoveRequest\s*=\s*async\s*\(folderKey,\s*fileName\)\s*=>\s*\{[\s\S]*fetch\(moveUrl\.toString\(\),\s*\{[\s\S]*method:\s*'PATCH'[\s\S]*targetFolderKey/, 'EvidenceDesk should move server-upload records through PATCH project-files endpoint.');
  assert.match(html, /firstAttempt\.response\.status\s*===\s*404[\s\S]*shouldRetryWithFallback[\s\S]*sendMoveRequest\(fallbackLocation\.folderKey,\s*fallbackLocation\.storedName\)/, 'EvidenceDesk should retry server-upload moves using fallback URL-derived location details when metadata is stale.');
  assert.match(html, /fetch\(buildProjectPointFileApiUrl\(projectId, pointFileId\),\s*\{[\s\S]*method:\s*'PATCH'[\s\S]*pointFileName:\s*nextTitle[\s\S]*pointFileState:\s*currentState/, 'EvidenceDesk should rename point files through PATCH point-file API while preserving state');
  assert.match(html, /renamePointFileButton\.textContent\s*=\s*'Rename'/, 'EvidenceDesk point-file rows should expose a Rename button');
  assert.match(html, /const\s+isPointFileFormat\s*=\s*pointFileFormat\s*===\s*'csv'\s*\|\|\s*pointFileFormat\s*===\s*'txt';/, 'EvidenceDesk should only launch PointForge for point-file formats.');
  assert.match(html, /import\s*\{\s*renderLineworkThumbnailDataUrl,\s*renderPointFileThumbnailDataUrl\s*\}\s*from\s*'\.\/src\/point-thumbnail-client\.js'/, 'EvidenceDesk should import the shared point thumbnail client.');
  assert.match(html, /async function\s+attachPointFilePreview\(/, 'EvidenceDesk should define a point-file preview hydration helper.');
  assert.match(html, /renderPointFileThumbnailDataUrl\(text,\s*\{\s*width:\s*86,\s*height:\s*50\s*\}\)/, 'EvidenceDesk should render point file thumbnails through the shared client library.');
  assert.match(html, /className\s*=\s*'point-file-preview-thumb'/, 'EvidenceDesk should render point file thumbnail images in file rows.');
  assert.match(html, /querySelector\('\.file-preview-slot'\)\?\.replaceChildren\(thumb\)/, 'EvidenceDesk should place point file thumbnails in the dedicated preview slot before file names.');
  assert.match(html, /function\s+isImageResource\(entry\)\s*\{[\s\S]*\['png',\s*'jpg',\s*'jpeg',\s*'gif',\s*'webp',\s*'bmp',\s*'svg'\]/, 'EvidenceDesk should detect uploaded image resources by common file extensions.');
  assert.match(html, /function\s+attachImagePreview\(resource,\s*entry\)\s*\{[\s\S]*reference\?\.metadata\?\.thumbnailUrl\s*\|\|\s*entry\?\.reference\?\.value[\s\S]*className\s*=\s*'image-preview-thumb'/, 'EvidenceDesk should prefer server-generated image thumbnail URLs for uploaded image previews.');
  assert.match(html, /const\s+showThumbnailSlot\s*=\s*canLaunchPointForge\s*\|\|\s*canOpenLineSmithDrawing\s*\|\|\s*isPdfResource\s*\|\|\s*isImageUpload;/, 'EvidenceDesk should reserve thumbnail space for image uploads in the file browser.');
  assert.match(html, /function\s+uploadFileViaXhr\(formData,\s*onProgress\)\s*\{[\s\S]*xhr\.upload\.addEventListener\('progress'/, 'EvidenceDesk should use XHR upload progress events for project file uploads.');
  assert.match(html, /Uploading \$\{currentFileNumber\}\/\$\{totalFiles\}: \$\{file\.name\} \(\$\{progress\}%\)/, 'EvidenceDesk should include percentage progress updates for uploaded files.');
  assert.match(html, /className\s*=\s*'upload-progress'/, 'EvidenceDesk should render a dedicated upload progress bar element.');
  assert.match(html, /context\.setUploadProgress\(progress\);/, 'EvidenceDesk should drive upload progress updates from XHR progress events.');
  assert.match(html, /addUploadStatusListener\(listener\)\s*\{[\s\S]*listener\(this\.uploadStatus,\s*this\.uploadProgress\);/, 'EvidenceDesk should immediately hydrate upload status/progress listeners so indicators update live.');
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
  assert.match(html, /deleteDrawingButton\.textContent\s*=\s*'Delete'/, 'EvidenceDesk drawing rows should expose a Delete button');
  assert.match(html, /fetch\(buildProjectDrawingApiUrl\(projectId, drawingId\),\s*\{ method: 'DELETE' \}\)/, 'EvidenceDesk should delete drawings through DELETE drawing API endpoint');
  assert.match(html, /async function\s+attachDrawingPreview\(/, 'EvidenceDesk should define a drawing preview hydration helper.');
  assert.match(html, /renderLineworkThumbnailDataUrl\(points,\s*\{\s*width:\s*86,\s*height:\s*50\s*\}\)/, 'EvidenceDesk should render drawing thumbnails through the shared field-to-finish thumbnail library.');
  assert.match(html, /className\s*=\s*'drawing-preview-thumb'/, 'EvidenceDesk should render drawing thumbnail images in drawing rows.');
  assert.match(html, /querySelector\('\.file-preview-slot'\)\?\.replaceChildren\(thumb\)/, 'EvidenceDesk should place drawing thumbnails in the dedicated preview slot before file names.');
  assert.match(html, /renameResourceTitle\(projectContext\?\.projectFile, folder\?\.key, entry\?\.id, nextTitle\)/, 'EvidenceDesk should rename non-API resources in project-file index state');
});

test('EvidenceDesk file rows keep controls aligned and always visible', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');
  assert.match(html, /\.file-name-configured\s*\{[\s\S]*color:\s*#f8fafc;[\s\S]*font-weight:\s*600;[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/, 'EvidenceDesk should truncate configured file names so controls stay visible.');
  assert.match(html, /\.file-actions\s*\{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*flex-end;[\s\S]*margin-left:\s*auto;/, 'EvidenceDesk should render actions in a dedicated right-aligned button container.');
  assert.match(html, /const\s+leadingIcon\s*=\s*showThumbnailSlot\s*\?\s*''\s*:\s*'<span class="icon">📄<\/span>';/, 'EvidenceDesk should omit the extra PDF icon when a PDF thumbnail is shown.');
  assert.match(html, /const\s+showThumbnailSlot\s*=\s*canLaunchPointForge\s*\|\|\s*canOpenLineSmithDrawing\s*\|\|\s*isPdfResource\s*\|\|\s*isImageUpload;/, 'EvidenceDesk should reserve thumbnail space for rows that support generated previews, including image uploads.');
  assert.match(html, /const\s+thumbnailSlotMarkup\s*=\s*showThumbnailSlot\s*\?\s*'<span class="file-preview-slot" aria-hidden="true"><\/span>'\s*:\s*'';/, 'EvidenceDesk should avoid adding thumbnail markup to non-preview folders.');
  assert.match(html, /resource\.innerHTML\s*=\s*`<span class="file-meta">\$\{leadingIcon\}\$\{thumbnailSlotMarkup\}<span class="file-name"><span class="file-name-configured" title="\$\{actualFileName\}">\$\{configuredFileName\}<\/span><\/span><\/span>`;/, 'EvidenceDesk should remove the extra actual filename column from row content.');
  assert.match(html, /const\s+actionButtons\s*=\s*document\.createElement\('div'\);[\s\S]*actionButtons\.className\s*=\s*'file-actions';/, 'EvidenceDesk should construct a shared actions container for each file row.');
  assert.match(html, /actionButtons\.appendChild\(openButton\);[\s\S]*actionButtons\.appendChild\(deleteButton\);[\s\S]*actionButtons\.appendChild\(renameButton\);/, 'EvidenceDesk should append open\/delete\/rename controls into the aligned action container.');
  assert.doesNotMatch(html, /file-name-actual/, 'EvidenceDesk should no longer render the legacy actual file name label in each row.');
});

test('EvidenceDesk opens PDFs in dedicated browser windows', async () => {
  const html = await readFile(new URL('../PROJECT_BROWSER.html', import.meta.url), 'utf8');
  assert.match(html, /function\s+openPdfInNewWindow\(pdfUrl\)\s*\{[\s\S]*window\.open\('',\s*'_blank',\s*'popup=yes,width=1200,height=900'\)[\s\S]*popup\.location\.replace\(pdfUrl\);/, 'EvidenceDesk should open PDFs in a dedicated popup window and then navigate it to the PDF URL.');
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
  assert.match(html, /const\s+pointThumbnailClient\s*=\s*window\.SurveyCadPointThumbnailClient\s*\|\|\s*null;/, 'PointForge should initialize the shared thumbnail client from window scope.');
  assert.match(html, /if\s*\(pointThumbnailClient\?\.parseFieldToFinishDirective\)/, 'PointForge should delegate field-to-finish directive parsing to the shared client.');
  assert.match(html, /function\s+parseFieldToFinishDirective\(/, 'PointForge should parse field-to-finish directives to identify linework groupings.');
  assert.match(html, /const\s+FIELD_TO_FINISH_STORAGE_KEY\s*=\s*"linesmith:field-to-finish:global";/, 'PointForge should read the shared field-to-finish storage key for thumbnail line-type filtering.');
  assert.match(html, /function\s+getThumbnailLineworkCodes\(\)\s*\{[\s\S]*deriveLineworkCodesFromFldConfig/, 'PointForge should derive thumbnail linework codes from shared field-to-finish settings.');
  assert.match(html, /function\s+getThumbnailSymbolRules\(\)\s*\{[\s\S]*entityType\s*!==\s*"0"[\s\S]*cachedThumbnailSymbolRules\.set\(code,\s*symbolMapFile\);/, 'PointForge should derive symbol-type code mappings from shared field-to-finish settings.');
  assert.match(html, /function\s+buildPointGroupSymbolThumbnail\(codeKey\s*=\s*""\)\s*\{[\s\S]*\/assets\/survey-symbols\/[\s\S]*<circle cx="44" cy="26" r="10" fill="#ffffff"\/>/, 'PointForge should render symbol thumbnails from mapped SVG assets and fallback to a filled white circle when no SVG exists.');
  assert.match(html, /lineworks\.flatMap\(\(linework\)=>linework\.segments\.map\(\(segment, index\)=>\(\{[\s\S]*label:\s*`\$\{linework\.baseCode\} line \$\{index \+ 1\}`/, 'PointForge should break grouped linework into per-line subgroup entries.');
  assert.match(html, /const\s+allSegments\s*=\s*group\.lineworks\.flatMap\(\(linework\)=>linework\.segments\s*\|\|\s*\[\]\);/, 'PointForge group selection should open all lines in the group instead of only the first line code.');
  assert.match(html, /if\s*\(group\.subgroups\.length\s*>\s*1\)/, 'PointForge should only render individual subgroup lines when a code has more than one independent line.');
  assert.match(html, /function\s+buildBoundaryLabCsvFromSegments\(/, 'PointForge should build BoundaryLab handoff payloads from selected groups/subgroups.');
  assert.match(html, /openLinkedApp\(`\/BoundaryLab\.html\?source=pointforge/, 'PointForge group explorer should offer opening selected linework in BoundaryLab.');
});


test('PointForge auto-focuses transformed point editor accordion and hides stats/log panels', async () => {
  const html = await readFile(new URL('../POINT_TRANSFORMER.HTML', import.meta.url), 'utf8');
  assert.match(html, /<section class="leftStack">[\s\S]*<div class="localizationPanel">[\s\S]*<section class="panel" id="ingestPanel">/, 'PointForge should place localization controls above the ingest console panel.');
  assert.match(html, /<section class="leftStack">[\s\S]*<div class="accordionStack">[\s\S]*<section class="panel" id="ingestPanel">[\s\S]*<section class="panel outputArea" id="outputPanel">/, 'PointForge should place ingest and output panels in a dedicated accordion stack below localization controls.');
  assert.match(html, /\.accordionStack\{\s*position:relative;\s*min-height:\s*780px;\s*\}/, 'PointForge should anchor accordion overlays inside a relative accordion stack container.');
  assert.match(html, /#outputPanel\{[\s\S]*position:relative;[\s\S]*transition:\s*transform \.25s ease, opacity \.2s ease;/, 'PointForge should define the output panel base state for accordion transitions.');
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


test('LineSmith reuses shared field-to-finish parsing engine for sequential directives', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\/src\/point-thumbnail-client\.js"><\/script>/, 'LineSmith should load the shared thumbnail and field-to-finish client bundle.');
  assert.match(html, /const\s+pointThumbnailClient\s*=\s*window\.SurveyCadPointThumbnailClient\s*\|\|\s*null;/, 'LineSmith should read shared field-to-finish helpers from window scope.');
  assert.match(html, /if\s*\(pointThumbnailClient\?\.resolveSequentialDirectiveBaseCode\)/, 'LineSmith should delegate directive base-code resolution to the shared rules engine.');
});
