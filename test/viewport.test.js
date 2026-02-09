import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';



test('VIEWPORT.HTML includes icon-based quick toolbar shortcuts for core LineSmith actions', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\//, 'LineSmith should load a font icon set for quick toolbar buttons');
  assert.match(html, /id="quickTools"\s+class="quickTools"/, 'canvas should render a quick tools toolbar at the top of the drawing window');
  assert.match(html, /id="quickSave"[\s\S]*fa-floppy-disk/, 'quick toolbar should include Save icon shortcut');
  assert.match(html, /id="quickMapLayerEnabled"\s+type="checkbox"/, 'quick toolbar should include map layer toggle');
  assert.match(html, /<div class="quickToolField" title="Map tiles">\s*<select id="quickMapTileType"/, 'quick toolbar should include unlabeled inline map tile type dropdown');
  assert.doesNotMatch(html, /title="Map tiles">\s*Tiles\s*</, 'quick toolbar map tile selector should not include a redundant Tiles text label');
  assert.match(html, /id="quickShowPointCodes"\s+type="checkbox"\s+checked/, 'quick toolbar should include point code visibility toggle');
  assert.match(html, /id="quickShowPointNotes"\s+type="checkbox"\s+checked/, 'quick toolbar should include point notes visibility toggle');
  assert.match(html, /\.quickToolField\{[\s\S]*display:inline-flex;[\s\S]*flex-direction:row;/, 'quick toolbar control labels should render inline with row direction');
  assert.doesNotMatch(html, /\.quickToolField input\[type="checkbox"\][\s\S]*accent-color:/, 'quick toolbar checkboxes should keep native accent color styling');
  assert.match(html, /id="quickSelect"[\s\S]*fa-arrow-pointer/, 'quick toolbar should include Select/Move icon shortcut');
  assert.match(html, /id="quickAddPoint"[\s\S]*fa-circle-plus/, 'quick toolbar should include Add Point icon shortcut');
  assert.match(html, /id="quickLineByPoints"[\s\S]*fa-share-nodes/, 'quick toolbar should include Line by Points icon shortcut');
  assert.match(html, /id="quickUndo"[\s\S]*fa-rotate-left/, 'quick toolbar should include Undo icon shortcut');
  assert.match(html, /id="quickRedo"[\s\S]*fa-rotate-right/, 'quick toolbar should include Redo icon shortcut');
  assert.match(html, /id="quickZoomExtents"[\s\S]*fa-expand/, 'quick toolbar should include Zoom Extents icon shortcut');
  assert.match(html, /id="quickCenter"[\s\S]*fa-crosshairs/, 'quick toolbar should include Center icon shortcut');
  assert.match(html, /id="quickExtend"[\s\S]*fa-up-right-and-down-left-from-center/, 'quick toolbar should include Extend icon shortcut');
  assert.match(html, /id="quickTrimIntersect"[\s\S]*fa-scissors/, 'quick toolbar should include Trim\/Intersect icon shortcut');
  assert.match(html, /id="quickPointManager"[\s\S]*fa-list/, 'quick toolbar should include Point Manager icon shortcut');
  assert.match(html, /\$\("#quickSave"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#saveDrawingToProject"\)\.click\(\)\)/, 'quick Save should trigger the existing save drawing workflow');
  assert.match(html, /\$\("#quickExtend"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#extendToIntersect"\)\.click\(\)\)/, 'quick Extend should delegate to existing extend action');
  assert.match(html, /\$\("#quickTrimIntersect"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#trimToIntersect"\)\.click\(\)\)/, 'quick Trim\/Intersect should delegate to existing trim action');
});


test('VIEWPORT.HTML includes command line controls for line, move, rotate, and inverse workflows', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="commandInput"\s+type="text"/, 'LineSmith should expose a command line text input');
  assert.match(html, /id="runCommand"\s+class="primary"/, 'LineSmith should expose a command execution button');
  assert.match(html, /function\s+runCommandLine\(rawCommand\)/, 'LineSmith should parse and execute command line input');
  assert.match(html, /if \(cmd === "line"\)/, 'command line should support line creation by point numbers');
  assert.match(html, /Usage: line <point1> <point2>/, 'line command should provide usage guidance for missing arguments');
  assert.match(html, /if \(cmd === "move"\)/, 'command line should support move command');
  assert.match(html, /Usage: move <dx> <dy>/, 'move command should provide usage guidance for missing arguments');
  assert.match(html, /if \(cmd === "rotate"\)/, 'command line should support rotate command');
  assert.match(html, /startRotateSelectionSession\(\)/, 'rotate command should trigger staged rotate workflow');
  assert.match(html, /if \(cmd === "inverse"\)/, 'command line should support inverse command');
  assert.match(html, /lineMeasurement\(a, b\)/, 'inverse command should compute bearing and distance from two points');
  assert.match(html, /commandInput\?\.addEventListener\("keydown", \(e\) => \{[\s\S]*e\.key !== "Enter"/, 'command line should execute from Enter key');
});
test('VIEWPORT.HTML only treats strict boolean true as movable for point/line drag', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+isMovable\(value\)\s*\{\s*return\s+value\s*===\s*true;\s*\}/, 'movable helper should require strict true');
  assert.match(html, /if \(selectedPointId === pid && isMovable\(p\?\.movable\)\)/, 'point drag should require strict movable true');
  assert.match(html, /if \(isMovable\(ln\?\.movable\)\)\s*\{\s*history\.push\("move line"\)/, 'line drag should require strict movable true');
});



test('VIEWPORT.HTML supports reference-angle rotation of selected geometry from canvas picks', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="rotateSelectionReference"\s+class="primary"/, 'selection panel should include a reference-angle rotate action');
  assert.match(html, /function\s+getRotatablePointIdsFromSelection\(\)/, 'LineSmith should gather unique selected points and line endpoints for rotation');
  assert.match(html, /function\s+startRotateSelectionSession\(\)/, 'LineSmith should define a staged rotate session bootstrap');
  assert.match(html, /Rotate selection: click base point\./, 'rotate workflow should prompt for the base point first');
  assert.match(html, /function\s+rotateSelectedFromReference\(basePoint, fromPoint, toPoint\)/, 'LineSmith should rotate selection based on reference and target angle picks');
  assert.match(html, /history\.push\("rotate selection \(reference\)"\)/, 'reference-angle rotate should create an undo entry');
  assert.match(html, /Math\.atan2\(fromPoint\.y - basePoint\.y, fromPoint\.x - basePoint\.x\)/, 'rotate should compute source angle from base and reference points');
  assert.match(html, /Math\.atan2\(toPoint\.y - basePoint\.y, toPoint\.x - basePoint\.x\)/, 'rotate should compute target angle from base and destination points');
  assert.match(html, /if \(!typing && e\.key === "Escape" && rotateSelectionSession\.active\)/, 'Esc should cancel active reference-angle rotation session');
  assert.match(html, /if \(rotateSelectionSession\.active\) \{[\s\S]*handleRotateSelectionCanvasPick\(mouse\.x, mouse\.y\);[\s\S]*return;/, 'canvas clicks should route to rotate pick stages while rotate mode is active');
});
test('VIEWPORT.HTML restores persisted movable flags as strict booleans', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /points\.set\(p\.id,\s*\{\s*\.\.\.p,\s*movable:\s*isMovable\(p\.movable\)\s*\}\)/, 'restored points should normalize movable flags');
  assert.match(html, /lines\.set\(l\.id,\s*\{\s*\.\.\.l,\s*movable:\s*isMovable\(l\.movable\)\s*\}\)/, 'restored lines should normalize movable flags');
});


test('VIEWPORT.HTML provides toggles to hide/show point code and notes labels', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="showPointCodes"\s+type="checkbox"\s+checked/, 'display section should include a checked point code toggle');
  assert.match(html, /id="showPointNotes"\s+type="checkbox"\s+checked/, 'display section should include a checked point notes toggle');
  assert.match(html, /if \(labelVisibility\.codes && p\.code\)/, 'code labels should render only when the code toggle is enabled');
  assert.match(html, /if \(labelVisibility\.notes && p\.notes\)/, 'notes labels should render only when the notes toggle is enabled');
  assert.match(html, /showPointCodesInput\?\.addEventListener\("change"/, 'code visibility toggle should be wired to change events');
  assert.match(html, /quickShowPointCodesInput\?\.addEventListener\("change"/, 'quick toolbar code toggle should be wired to change events');
  assert.match(html, /showPointNotesInput\?\.addEventListener\("change"/, 'notes visibility toggle should be wired to change events');
  assert.match(html, /quickShowPointNotesInput\?\.addEventListener\("change"/, 'quick toolbar notes toggle should be wired to change events');
});


test('VIEWPORT.HTML renders conditional line labels and avoids text collisions', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+lineLabelCandidates\s*=\s*\[\]/, 'draw loop should gather line label candidates');
  assert.match(html, /if \(pixelLength < labelW \+ 24\) continue;/, 'line labels should only draw when the label can fit beside the line');
  assert.match(html, /blockedTextRects\.some\(\(r\) => rectsOverlap\(r, candidateAabb\)\)/, 'line labels should skip drawing when they overlap existing text bounds');
});

test('VIEWPORT.HTML includes line inspector card for selected line or two points', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="lineInspector"\s+class="inspectorCard"/, 'selection panel should include the line inspector card');
  assert.match(html, /else if \(selectedPointIds\.length === 2\)/, 'inspector should support computing measurements from two selected points');
  assert.match(html, /lineInspector\.innerHTML\s*=\s*[\s\S]*Distance[\s\S]*Bearing/, 'inspector should render distance and bearing rows');
});


test('VIEWPORT.HTML exposes map backdrop controls with expected defaults and wiring', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="mapLayerEnabled"\s+type="checkbox"/, 'display section should include a map enable toggle');
  assert.match(html, /id="mapTileType"[\s\S]*value="satellite"\s+selected/, 'map tile selector should default to satellite');
  assert.match(html, /id="mapOpacity"\s+type="range"\s+min="0"\s+max="100"[\s\S]*value="10"/, 'map opacity slider should default to 10 percent');
  assert.match(html, /const\s+mapLayerState\s*=\s*\{[\s\S]*enabled:\s*false,[\s\S]*tileType:\s*"satellite",[\s\S]*opacity:\s*0\.1/, 'map state should initialize disabled with satellite and 10 percent opacity');
  assert.match(html, /id="mapBackdrop"\s+class="mapBackdrop"/, 'canvas area should include a dedicated map backdrop container behind the drawing canvas');
  assert.match(html, /mapEnabledInput\.addEventListener\("change",\s*\(\)\s*=>\s*\{[\s\S]*setMapLayerEnabled\(mapEnabledInput\.checked\)/, 'map toggle should be wired to set enabled state');
  assert.match(html, /quickMapEnabledInput\?\.addEventListener\("change",\s*\(\)\s*=>\s*\{[\s\S]*setMapLayerEnabled\(quickMapEnabledInput\.checked\)/, 'quick toolbar map toggle should be wired to set enabled state');
  assert.match(html, /mapTileTypeInput\.addEventListener\("change"[\s\S]*setMapTileType\(mapTileTypeInput\.value\)/, 'map tile selector should update current tileset');
  assert.match(html, /quickMapTileTypeInput\?\.addEventListener\("change"[\s\S]*setMapTileType\(quickMapTileTypeInput\.value\)/, 'quick toolbar map tile selector should update current tileset');
  assert.match(html, /mapOpacityInput\.addEventListener\("input"[\s\S]*mapLayerState\.opacity\s*=\s*clamp\(parseNum\(mapOpacityInput\.value,\s*10\)\s*\/\s*100,\s*0,\s*1\)/, 'opacity slider should update map backdrop opacity');
  assert.match(html, /function\s+zoomExtents\(options\s*=\s*\{\}\)/, 'zoom extents helper should accept options for silent and history-safe recentering');
  assert.match(html, /if \(mapLayerState\.enabled\) \{[\s\S]*if \(points\.size > 0\) \{[\s\S]*zoomExtents\(\{ skipHistory: true, silent: true \}\);/, 'enabling map layer should reframe to drawing extents without mutating undo history');
});


test('VIEWPORT.HTML maps Idaho state plane coordinates to Leaflet lat/lon via georeference transform', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+FEET_TO_METERS\s*=\s*0\.3048006096012192/, 'map sync should use an exact US survey foot to meter conversion');
  assert.match(html, /let\s+mapGeoreference\s*=\s*null/, 'map sync should track current georeference transform state');
  assert.match(html, /function\s+buildGeoreferenceTransform\(pointsList\)/, 'LineSmith should build a transform from sampled PointForge georeference points');
  assert.match(html, /mapGeoreference\s*=\s*buildGeoreferenceTransform\(pointsList\)/, 'PointForge payload alignment should build and store georeference mapping');
  assert.match(html, /function\s+worldToLatLng\(x, y\)/, 'map sync should convert state-plane world coordinates into geographic coordinates');
  assert.match(html, /const\s+ll\s*=\s*worldToLatLng\(center\.x, center\.y\);/, 'map center sync should use georeferenced conversion instead of raw x\/y as lat\/lon');
  assert.match(html, /function\s+scaleToLeafletZoomForLat\(scale, lat\)/, 'map zoom sync should compute web map zoom from Idaho feet-per-pixel scale');
  assert.match(html, /const\s+zoom\s*=\s*scaleToLeafletZoomForLat\(view\.scale, ll\.lat\);/, 'map zoom sync should honor georeferenced latitude and drawing scale');
});


test('VIEWPORT.HTML includes mobile-first canvas interactions and slide-out drawer controls', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /@media \(max-width:\s*960px\)[\s\S]*\.app\.drawerOpen \.panel\{ transform:translateX\(0\); \}/, 'mobile layout should convert controls panel into a slide-out drawer');
  assert.match(html, /id="drawerToggle"\s+class="drawerToggle"/, 'canvas area should expose a drawer toggle button for mobile controls');
  assert.match(html, /canvas\{[\s\S]*touch-action:none;/, 'canvas should disable native touch actions so custom pinch\/pan gestures can run');
  assert.match(html, /canvas\.addEventListener\("pointerdown"[\s\S]*touchGesture\.mode = "pinch"/, 'touch pointer down should initialize pinch mode for two-finger zoom');
  assert.match(html, /canvas\.addEventListener\("pointermove"[\s\S]*view\.scale = newScale;[\s\S]*view\.panX = touchGesture\.startPanX/, 'touch pointer move should apply pinch zoom scale and drag pan updates');
  assert.match(html, /window\.setTimeout\([\s\S]*pickPoint\(mouse\.x, mouse\.y, 14\)[\s\S]*pickLine\(mouse\.x, mouse\.y, 12\)/, 'long-press should attempt selection of points or lines');
  assert.match(html, /if \(tool === \"addPoint\"\) \{[\s\S]*history\.push\(\"add point\"\)[\s\S]*const\s+pidNew\s*=\s*addPoint\(/, 'long-press add point mode should create a point when add-point tool is active');
  assert.match(html, /beginDrag\(\{type:"marquee", x0: mouse\.x, y0: mouse\.y, x1: mouse\.x, y1: mouse\.y, additive:false\}\);/, 'long-press on blank canvas should begin box-select marquee drag');
});


test('VIEWPORT.HTML starts desktop marquee selection on primary-button blank-canvas drag', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const additive = e\.shiftKey;/, 'desktop additive window selection should be controlled only by Shift state');
  assert.match(html, /if \(e\.button === 0\) \{\s*beginDrag\(\{type:"marquee", x0: mouse\.x, y0: mouse\.y, x1: mouse\.x, y1: mouse\.y, additive\}\);/, 'left-clicking blank canvas should always start marquee drag, with additive selection honored when Shift is held');
});


test('VIEWPORT.HTML point inspector surfaces CP&F instrument links from selected point notes', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="pointInspector"\s+class="inspectorCard"/, 'selection panel should include a point inspector card');
  assert.match(html, /function\s+parseCpfInstruments\(value\s*=\s*""\)/, 'point inspector should parse CP&F instrument values from notes');
  assert.ok(html.includes('raw.replace(/^CPNFS?:\\s*/i, "")'), 'point inspector should strip CPNFS prefix from notes when parsing instrument IDs');
  assert.ok(html.includes('.split(/\\.\\.\\.|[,;|\\n]+/)'), 'point inspector should split CP&F notes on ellipses and common delimiters');
  assert.match(html, /function\s+buildCpfInstrumentUrl\(instrument\)/, 'point inspector should build CP&F PDF links from instrument IDs');
  assert.match(html, /ADA_CPF_PDF_BASE\s*=\s*"https:\/\/gisprod\.adacounty\.id\.gov\/apps\/acdscpf\/CpfPdfs\/"/, 'point inspector should use the Ada CP&F PDF base path');
  assert.match(html, /cpfLabel\.textContent\s*=\s*"CP&F"/, 'point inspector should render a dedicated CP&F row');
  assert.match(html, /a\.textContent\s*=\s*`Open\s+\$\{instrument\}`/, 'point inspector should render quick-open CP&F links per instrument');
});


test('VIEWPORT.HTML supports project-linked named differential drawing saves and version restore', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="saveDrawingToProject"\s+class="ok"/, 'LineSmith should include a save-to-project action for drawings');
  assert.match(html, /id="restoreDrawingVersion"/, 'LineSmith should include a restore saved version action');
  assert.match(html, /const\s+PROJECT_DRAWING_STORAGE_PREFIX\s*=\s*"surveyfoundryLineSmithDrawing"/, 'LineSmith should persist drawing history using a dedicated local storage namespace');
  assert.match(html, /function\s+diffState\(previous, next\)/, 'LineSmith should compute differential patches between saved drawing states');
  assert.match(html, /function\s+applyStateDiff\(base, diff\)/, 'LineSmith should reconstruct drawing versions from differential history');
  assert.match(html, /function\s+saveDrawingToProject\(\)/, 'LineSmith should define drawing save handler');
  assert.match(html, /window\.prompt\("Name this drawing before saving:",\s*"Boundary Base Map"\)/, 'save workflow should prompt for a drawing name when blank');
  assert.match(html, /if \(drawingNameInput\) drawingNameInput\.value = drawingName;/, 'save workflow should write prompted drawing name back to input');
  assert.match(html, /versions\.push\(\{[\s\S]*diffFromPrevious:/, 'subsequent saves should append differential revisions');
  assert.match(html, /function\s+promptRestoreDrawingVersion\(\)/, 'LineSmith should expose saved version restore workflow');
  assert.ok(html.includes('.join("\\n")'), 'restore workflow should join version choices with escaped newline separators');
  assert.match(html, /tryImportProjectBrowserDrawingPayload\(\)/, 'LineSmith should support opening saved drawing payloads launched from Project Browser');
  assert.match(html, /mapGeoreference:\s*mapGeoreference\s*\?\s*\{/, 'saved drawing snapshots should persist georeference transform data');
  assert.match(html, /mapGeoreference\s*=\s*s\.mapGeoreference\s*&&/, 'restored drawing snapshots should hydrate georeference transform data');
  assert.match(html, /if \(mapLayerState\.enabled\) syncMapToView\(true\);/, 'restoring a drawing should resync map view after georeference hydration');
});
