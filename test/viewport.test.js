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
  assert.match(html, /id="quickRotateSelection"[\s\S]*fa-rotate/, 'quick toolbar should include Rotate Selection icon shortcut');
  assert.match(html, /id="quickPointManager"[\s\S]*fa-list/, 'quick toolbar should include Point Manager icon shortcut');
  assert.match(html, /function\s+startLineByPointsFromToolbar\(\)\s*\{[\s\S]*if \(selectedPointIds\.length >= 2\) \{[\s\S]*runLineBetweenSelectedPoints\(\{ returnToSelectionTool: true \}\);[\s\S]*setTool\("line2pt"\);/, 'quick Line by Points should run line-between-selected when points are preselected and otherwise enter two-point draw mode');
  assert.match(html, /async\s+function\s+runLineBetweenSelectedPoints\(\{ returnToSelectionTool = false \} = \{\}\)[\s\S]*if \(returnToSelectionTool\) setTool\("select"\);/, 'line-between-selected workflow should optionally return to selection tool after completion');
  assert.match(html, /\$\("#quickSave"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#saveDrawingToProject"\)\.click\(\)\)/, 'quick Save should trigger the existing save drawing workflow');
  assert.match(html, /\$\("#quickExtend"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#extendToIntersect"\)\.click\(\)\)/, 'quick Extend should delegate to existing extend action');
  assert.match(html, /\$\("#quickTrimIntersect"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#trimToIntersect"\)\.click\(\)\)/, 'quick Trim\/Intersect should delegate to existing trim action');
  assert.match(html, /\$\("#quickRotateSelection"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*startRotateSelectionSession\(\)\)/, 'quick Rotate should start reference rotate workflow');
});






test('VIEWPORT.HTML line-between-selected prompts for nearest non-connected ordering when sequential point gaps are longer', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+shouldSuggestNearestNonConnectedOrder\(pointIds\)/, 'line-between-selected should detect when sequential numbering creates longer hops than nearest selected non-connected neighbors');
  assert.match(html, /id="connectLinesModal"[\s\S]*<b>Connect Lines<\/b>[\s\S]*Sequentially[\s\S]*By Distance/, 'line-between-selected should present a Connect Lines modal with Sequentially and By Distance actions');
  assert.match(html, /function\s+askConnectLinesOrder\(\)\s*\{[\s\S]*cleanup\("sequential"\)[\s\S]*cleanup\("distance"\)/, 'line-between-selected should resolve ordering through modal button handlers instead of a browser confirm prompt');
  assert.match(html, /function\s+buildNearestNonConnectedOrder\(pointIds\)/, 'line-between-selected should build a nearest-neighbor order that prefers non-connected selected points');
  assert.match(html, /Created \$\{created\} line\(s\) using \$\{connectionLabel\}:/, 'line-between-selected status message should report which ordering mode was used');
});
test('VIEWPORT.HTML renders unlocked lines in maroon for movement warning', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /ctx\.strokeStyle = isMovable\(ln\.movable\) \? "#800000" : "#fff";/, 'unlocked lines should render maroon while locked lines remain white');
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
  assert.match(html, /if \(!typing && e\.key === "Escape"\) \{[\s\S]*runCanvasCancelOrClearAction\(\{ trigger: "escape" \}\);/, 'Esc should route through the shared canvas cancel-or-clear workflow');
  assert.match(html, /function\s+drawRotateSelectionPreview\(\)/, 'rotate workflow should draw on-canvas preview guides while picking reference and target angles');
  assert.match(html, /ctx\.lineTo\(cursor\.x, cursor\.y\)/, 'rotate preview should draw a live line from base point to current cursor');
  assert.match(html, /rotateSelectionSession\.step >= 2 && rotateSelectionSession\.fromPoint/, 'rotate preview should retain reference-bearing guide after reference point is set');
  assert.match(html, /drawRotateSelectionPreview\(\);/, 'draw loop should render rotate preview overlays while session is active');
  assert.match(html, /if \(rotateSelectionSession\.active && !rotateSelectionSession\.awaitingSelection\) \{[\s\S]*handleRotateSelectionCanvasPick\(mouse\.x, mouse\.y\);[\s\S]*return;/, 'canvas clicks should route to rotate pick stages while rotate mode is active and selection has been captured');
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
  assert.match(html, /id="mapOpacity"\s+type="range"\s+min="0"\s+max="100"[\s\S]*value="66"/, 'map opacity slider should default to 66 percent');
  assert.match(html, /const\s+mapLayerState\s*=\s*\{[\s\S]*enabled:\s*false,[\s\S]*tileType:\s*"satellite",[\s\S]*opacity:\s*0\.66/, 'map state should initialize disabled with satellite and 66 percent opacity');
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




test('VIEWPORT.HTML auto-enables map layer when bootstrapping PointForge imports', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+tryImportPointforgePayload\(\)/, 'LineSmith should include PointForge launch bootstrap');
  assert.match(html, /if \(launchSource !== "pointforge"\) return false;/, 'PointForge bootstrap should only trigger from the pointforge source query param');
  assert.match(html, /importCsvText\(payload\.csv, "PointForge import"\);[\s\S]*setMapLayerEnabled\(true\);/, 'PointForge imports should default the map layer to enabled after loading points');
});
test('VIEWPORT.HTML includes mobile-first canvas interactions and slide-out drawer controls', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /@media \(max-width:\s*960px\)[\s\S]*\.app\.drawerOpen \.panel\{ transform:translateX\(0\); \}/, 'mobile layout should convert controls panel into a slide-out drawer');
  assert.match(html, /id="drawerToggle"\s+class="drawerToggle"/, 'canvas area should expose a drawer toggle button for mobile controls');
  assert.match(html, /canvas\{[\s\S]*touch-action:none;/, 'canvas should disable native touch actions so custom pinch\/pan gestures can run');
  assert.match(html, /canvas\.addEventListener\("pointerdown"[\s\S]*touchGesture\.mode = "pinch"/, 'touch pointer down should initialize pinch mode for two-finger zoom');
  assert.match(html, /canvas\.addEventListener\("pointermove"[\s\S]*view\.scale = newScale;[\s\S]*view\.panX = touchGesture\.startPanX/, 'touch pointer move should apply pinch zoom scale and drag pan updates');
  assert.match(html, /window\.setTimeout\([\s\S]*pickPoint\(mouse\.x, mouse\.y, 14\)[\s\S]*pickLine\(mouse\.x, mouse\.y, 12\)/, 'long-press should attempt selection of points or lines');
  assert.match(html, /function\s+handleCanvasPrimaryAction\(\{ additive = false \} = \{\}\)/, 'canvas primary action logic should be reusable across mouse and touch input paths');
  assert.match(html, /function\s+handlePointerUp\(e\)\s*\{[\s\S]*const\s+shouldTreatAsTap\s*=\s*touchGesture\.mode === "pending" && !mobileInteraction\.moved;[\s\S]*if \(shouldTreatAsTap\) \{[\s\S]*handleCanvasPrimaryAction\(\);/, 'single-finger touch tap should trigger the same canvas action handler used by desktop clicks');
  assert.match(html, /if \(tool === \"addPoint\"\) \{[\s\S]*history\.push\(\"add point\"\)[\s\S]*const\s+pidNew\s*=\s*addPoint\(/, 'long-press add point mode should create a point when add-point tool is active');
  assert.match(html, /beginDrag\(\{type:"marquee", x0: mouse\.x, y0: mouse\.y, x1: mouse\.x, y1: mouse\.y, additive:false\}\);/, 'long-press on blank canvas should begin box-select marquee drag');
});




test('VIEWPORT.HTML keeps desktop collapse handle visible outside inspector panel edge', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /\.panel\{[\s\S]*overflow-y:auto;[\s\S]*overflow-x:visible;/, 'panel should allow horizontal overflow so the collapse tab can render outside the panel edge');
});

test('VIEWPORT.HTML includes desktop drawer collapse and edge expand affordances for Point Forge inspector controls', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /\.app\.panelCollapsed\{[\s\S]*grid-template-columns:\s*1fr\s+0;/, 'desktop layout should allow fully collapsing the controls panel width');
  assert.match(html, /id="panelCollapseHandle"\s+class="panelCollapseHandle"/, 'controls panel should include a collapse handle at the canvas edge');
  assert.match(html, /\.panelCollapseHandle\{[\s\S]*left:-14px;[\s\S]*border-right:none;/, "collapse handle should hang from the panel left edge so it stays over the canvas boundary");
  assert.match(html, /id="panelCollapseHandle"[^>]*>→<\/button>/, 'collapse handle affordance should point right to indicate collapsing the drawer');
  assert.match(html, /id="drawerEdgeExpand"\s+class="drawerEdgeExpand"/, 'canvas area should include a right-edge expand control when drawer is collapsed');
  assert.match(html, /function\s+setPanelCollapsed\(collapsed\)/, 'LineSmith should centralize panel collapse state updates in a helper');
  assert.match(html, /panelCollapseHandle\.addEventListener\("click", \(\) => setPanelCollapsed\(true\)\);/, 'collapse handle should collapse the panel on click');
  assert.match(html, /drawerEdgeExpand\.addEventListener\("click", \(\) => setPanelCollapsed\(false\)\);/, 'edge expand control should reopen the panel on click');
});

test('VIEWPORT.HTML resizes and re-syncs map viewport when collapsing desktop inspector drawer', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /let\s+mapViewportSignature\s*=\s*""/, 'map sync should track the last rendered canvas viewport size signature');
  assert.match(html, /const\s+viewportSignature\s*=\s*`\$\{Math\.round\(rect\.width\)\}x\$\{Math\.round\(rect\.height\)\}`;/, 'map sync should derive a viewport signature from canvas width and height');
  assert.match(html, /if \(force \|\| mapViewportSignature !== viewportSignature\) \{[\s\S]*mapInstance\.invalidateSize\(false\);/, 'map sync should invalidate Leaflet size whenever the canvas viewport dimensions change');
  assert.match(html, /function\s+setPanelCollapsed\(collapsed\) \{[\s\S]*window\.requestAnimationFrame\(\(\) => \{[\s\S]*resize\(\);[\s\S]*if \(mapLayerState\.enabled\) syncMapToView\(true\);[\s\S]*\}\);/, 'desktop panel collapse should force canvas resize and map re-sync on the next frame');
});


test('VIEWPORT.HTML starts desktop marquee selection on primary-button blank-canvas drag', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const additive = e\.shiftKey;/, 'desktop additive window selection should be controlled only by Shift state');
  assert.match(html, /beginDrag\(\{type:"marquee", x0: mouse\.x, y0: mouse\.y, x1: mouse\.x, y1: mouse\.y, additive\}\);/, 'left-clicking blank canvas should always start marquee drag, with additive selection honored when Shift is held');
});

test('VIEWPORT.HTML line intersection guided workflow auto-builds two-line selection without requiring Shift', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const guidedLineSelection = lineIntersectionCommandSession\.active;/, 'guided extend/trim workflow should detect active line-intersection command state');
  assert.match(html, /if \(guidedLineSelection\) \{[\s\S]*if \(idx >= 0\) selectedLines\[idx\] = \{ lineId: lpick\.lineId, grip: lpick\.grip, t: lpick\.t \};[\s\S]*else selectedLines\.push\(\{ lineId: lpick\.lineId, grip: lpick\.grip, t: lpick\.t \}\);/, 'guided extend/trim line picks should append or replace in-place without using additive Shift state');
  assert.match(html, /\(\$\{selectedCount === 0 \? "click line" : "click next line"\}; Shift-click still supports normal multi-select\)\./, 'guided extend/trim toast should describe click-only staged line picks while preserving Shift multi-select hint');
});


test('VIEWPORT.HTML includes reusable workflow toast guidance for staged rotate steps', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="workflowToast"\s+class="workflowToast hidden"/, 'canvas should include a top-right workflow toast container');
  assert.match(html, /@media \(max-width: 960px\) \{[\s\S]*\.workflowToast\{[\s\S]*bottom:110px;[\s\S]*left:8px;[\s\S]*\}/, 'mobile workflow toast should move above the bottom command toolbar to avoid blocking tool access');
  assert.match(html, /function\s+renderWorkflowToast\(\)/, 'workflow toast should render from reusable helper function');
  assert.match(html, /function\s+showWorkflowToast\(\{\s*title, message, steps, currentStepIndex\s*\}\)/, 'workflow toast should expose reusable show API for multi-step tools');
  assert.match(html, /function\s+hideWorkflowToast\(\)/, 'workflow toast should expose reusable hide API');
  assert.match(html, /function\s+getToolWorkflowToastPayload\(activeTool = tool\)/, 'workflow toast should expose reusable payload helper for toolbar tools');
  assert.match(html, /if \(activeTool === "line2pt"\) \{[\s\S]*Pick line start point[\s\S]*Pick line end point[\s\S]*currentStepIndex: hasStart \? 1 : 0/, 'line-by-2-points tool should publish stage-aware toast steps for first and second clicks');
  assert.match(html, /if \(activeTool === "lineDB"\) \{[\s\S]*Select start point[\s\S]*Enter distance \+ bearing[\s\S]*Click Create Point \+ Line/, 'line distance-bearing tool should publish select-input-submit guidance in toast steps');
  assert.match(html, /if \(activeTool === "pointOnLine"\) \{[\s\S]*Select line[\s\S]*Enter station \+ offset[\s\S]*Click Create Point/, 'point-on-line tool should publish select-input-submit guidance in toast steps');
  assert.match(html, /const\s+lineIntersectionCommandSession\s*=\s*\{[\s\S]*active:\s*false,[\s\S]*mode:\s*""[\s\S]*\};/, 'extend/trim intersection workflows should track an explicit staged command session state');
  assert.match(html, /function\s+syncLineIntersectionCommandToast\(\)\s*\{[\s\S]*const\s+firstStep\s*=\s*isTrim\s*\?\s*"Select trim boundary line"\s*:\s*"Select first line";[\s\S]*const\s+secondStep\s*=\s*isTrim\s*\?\s*"Select line to trim \(click desired side\)"\s*:\s*"Select second line";/, 'extend/trim should show workflow toast guidance while gathering two selected lines, including trim-first boundary and trim-side targeting guidance');
  assert.match(html, /function\s+startLineIntersectionCommand\(mode\)[\s\S]*setTool\("select"\);[\s\S]*Line \$\{mode\}: select two lines to continue\./, 'starting extend/trim without selected lines should switch to select mode and prompt the user');
  assert.match(html, /function\s+syncToolWorkflowToast\(\) \{[\s\S]*if \(lineIntersectionCommandSession\.active\) return;[\s\S]*if \(rotateSelectionSession\.active\) return;[\s\S]*showWorkflowToast\(payload\);/, 'tool workflow sync should defer while line-intersection command guidance is active');
  assert.match(html, /const\s+rotateWorkflowSteps\s*=\s*\[[\s\S]*Select items to rotate[\s\S]*Select a point to rotate around[\s\S]*Select a basis of rotation[\s\S]*Select a target rotation[\s\S]*\]/, 'rotate flow should publish step-by-step guidance labels');
  assert.match(html, /rotateSelectionSession\.awaitingSelection\s*=\s*!rotateIds\.length;/, 'rotate workflow should enter selection-capture mode when started without a selection');
  assert.match(html, /setTool\("select"\);[\s\S]*Select items to rotate with a window or click selection/, 'rotate workflow should prompt user to window/click select items when none are selected');
  assert.match(html, /if \(rotateSelectionSession\.active && !rotateSelectionSession\.awaitingSelection\) \{[\s\S]*handleRotateSelectionCanvasPick\(mouse\.x, mouse\.y\);/, 'rotate pick interception should allow marquee selection while waiting for rotation selection');
  assert.match(html, /if \(rotateSelectionSession\.active\) \{[\s\S]*rotateSelectionSession\.awaitingSelection && rotateIds\.length[\s\S]*syncRotateWorkflowToast\(\);[\s\S]*\}/, 'marquee selection should advance rotate workflow and refresh toast guidance');
});

test('VIEWPORT.HTML right-click cancels active command before clearing selection', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+hasSelection\(\)\s*\{[\s\S]*selectedPointIds\.length > 0 \|\| selectedLines\.length > 0;/, 'LineSmith should provide a helper to detect whether point or line selection exists');
  assert.match(html, /function\s+cancelActiveCanvasCommand\(\)\s*\{[\s\S]*if \(rotateSelectionSession\.active\) \{[\s\S]*cancelRotateSelectionSession\(true\);[\s\S]*if \(lineIntersectionCommandSession\.active\) \{[\s\S]*stopLineIntersectionCommand\(\);[\s\S]*if \(construction\.startPointId !== null\) \{[\s\S]*construction\.startPointId = null;[\s\S]*if \(tool !== "select" && tool !== "pan"\) \{[\s\S]*setTool\("select"\);/, 'right-click command cancellation should stop rotate and extend/trim staged sessions, clear in-progress construction starts, and return to select mode for drawing tools');
  assert.match(html, /canvas\.addEventListener\("mousedown", \(e\) => \{[\s\S]*if \(e\.button !== 0\) return;/, 'canvas mousedown workflows should only execute on primary button to reserve right-click for command cancellation/selection clear');
  assert.match(html, /function\s+runCanvasCancelOrClearAction\(\{ trigger = "generic" \} = \{\}\)\s*\{[\s\S]*if \(modalIsOpen\(\)\) return;[\s\S]*if \(cancelActiveCanvasCommand\(\)\) \{[\s\S]*return;[\s\S]*\}[\s\S]*if \(hasSelection\(\)\) \{[\s\S]*clearSelection\(\);[\s\S]*return;[\s\S]*\}/, 'LineSmith should share a reusable canvas cancel-or-clear routine for pointer and keyboard shortcuts');
  assert.match(html, /canvas\.addEventListener\("contextmenu", \(e\) => \{[\s\S]*runCanvasCancelOrClearAction\(\{ trigger: "right-click" \}\);/, 'context-menu right-click should run the shared cancel-or-clear workflow');
  assert.match(html, /function\s+runCanvasCancelOrClearAction\(\{ trigger = "generic" \} = \{\}\)\s*\{[\s\S]*if \(\(trigger === "escape" \|\| trigger === "right-click"\) && lastUnlockedEntity\) \{[\s\S]*lockLastUnlockedEntityFromEscape\(\);[\s\S]*Press Escape or right-click again to lock the last unlocked point\/line\./, 'Escape cancel routine should support double-escape locking of the last unlocked point/line when nothing is selected');
  assert.match(html, /window\.addEventListener\("keydown", \(e\) => \{[\s\S]*if \(!typing && e\.key === "Escape"\) \{[\s\S]*runCanvasCancelOrClearAction\(\{ trigger: "escape" \}\);/, 'Escape should call cancel-or-clear with escape trigger metadata for double-escape lock behavior');
});


test('VIEWPORT.HTML trim-to-intersect resolves trim side from click side on second selected line', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+trimGripFromClickSide\(activeSelection, hitParam\)\s*\{[\s\S]*return activeSelection\.t < hitParam \? "a" : "b";/, 'trim should derive endpoint grip from whether second-line click happened before or after the intersection along that line');
  assert.match(html, /\$\("#trimToIntersect"\)\.addEventListener\("click", \(\) => \{[\s\S]*const\s+hitT\s*=\s*pointOnLineParam\(\{x:hit\.x, y:hit\.y\}, A, B\);[\s\S]*const\s+trimGrip\s*=\s*trimGripFromClickSide\(active, hitT\);[\s\S]*active\.grip\s*=\s*trimGrip;/, 'trim command should recompute active grip using second-line click side before moving endpoint to the intersection');
  assert.match(html, /setStatus\(`Trimmed active line \(grip \$\{trimGrip\.toUpperCase\(\)\}\) to intersection at \(\$\{fmt\(hit\.x\)\}, \$\{fmt\(hit\.y\)\}\)\.`, "ok"\);/, 'trim status should report the side-derived grip endpoint that was trimmed');
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
  assert.match(html, /function\s+sanitizeMapGeoreference\(candidate\)/, 'LineSmith should centralize georeference validation for restores and history fallback');
  assert.match(html, /mapGeoreference\s*=\s*sanitizeMapGeoreference\(s\.mapGeoreference\);/, 'restored drawing snapshots should hydrate georeference transform data through sanitization');
  assert.match(html, /record\.latestMapGeoreference\s*=\s*sanitizeMapGeoreference\(currentState\.mapGeoreference\);/, 'saving should persist a latest georeference fallback alongside differential versions');
  assert.match(html, /const\s+fallbackGeoreference\s*=\s*sanitizeMapGeoreference\(record\.latestMapGeoreference\);[\s\S]*state\.mapGeoreference\s*=\s*fallbackGeoreference;/, 'version materialization should restore latest georeference when differential history omitted that field');
  assert.match(html, /latestMapGeoreference,/, 'project browser metadata should carry the latest georeference snapshot');
  assert.match(html, /latestSavedAt:\s*new Date\(\)\.toISOString\(\),/, 'project browser metadata should carry the latest drawing save timestamp');
  assert.match(html, /drawingsFolder\.index\.sort\(\(a, b\) => \{[\s\S]*latestSavedAt[\s\S]*return bValue - aValue;[\s\S]*\}\);/, 'project drawing resources should be sorted by latest saved timestamp descending');
  assert.match(html, /drawingsFolder\.index\s*=\s*drawingsFolder\.index\.filter\(\(entry\) => entry && typeof entry === "object"\);/, 'project drawing metadata save should ignore malformed drawing index entries before accessing entry ids');
  assert.match(html, /if \(mapLayerState\.enabled\) syncMapToView\(true\);/, 'restoring a drawing should resync map view after georeference hydration');
  assert.match(html, /for \(const p of \(s\.points \|\| \[\]\)\) \{[\s\S]*if \(!p \|\| typeof p !== "object" \|\| p\.id == null\) continue;[\s\S]*points\.set\(p\.id, \{ \.\.\.p, movable: isMovable\(p\.movable\) \}\);[\s\S]*\}/, 'restoreState should skip malformed point entries before indexing by id');
  assert.match(html, /for \(const l of \(s\.lines \|\| \[\]\)\) \{[\s\S]*if \(!l \|\| typeof l !== "object" \|\| l\.id == null \|\| l\.a == null \|\| l\.b == null\) continue;[\s\S]*lines\.set\(l\.id, \{ \.\.\.l, movable: isMovable\(l\.movable\) \}\);[\s\S]*\}/, 'restoreState should skip malformed line entries before indexing by id');
  assert.match(html, /selectedPointIds = Array\.isArray\(s\.selection\?\.selectedPointIds\)[\s\S]*filter\(\(id\) => points\.has\(id\)\)/, 'restoreState should drop stale selected point ids that are not present in restored points');
  assert.match(html, /selectedLines = Array\.isArray\(s\.selection\?\.selectedLines\)[\s\S]*filter\(\(entry\) => entry\?\.id != null && lines\.has\(entry\.id\)\)/, 'restoreState should drop stale selected lines that are not present in restored lines');
  assert.match(html, /let\s+lastSavedDrawingSnapshot\s*=\s*"";/, 'LineSmith should track a saved-state snapshot for unsaved-change prompts');
  assert.match(html, /function\s+markDrawingAsSaved\(\)/, 'LineSmith should expose helper to refresh saved snapshot baseline');
  assert.match(html, /function\s+hasUnsavedDrawingChanges\(\)/, 'LineSmith should expose helper to compare current state against last saved snapshot');
  assert.match(html, /window\.addEventListener\("message", \(event\) => \{[\s\S]*survey-cad:request-unsaved-state[\s\S]*hasUnsavedChanges: hasUnsavedDrawingChanges\(\)/, 'LineSmith should reply to launcher unsaved-state checks');
  assert.match(html, /survey-cad:request-save-before-navigate:response/, 'LineSmith should respond to launcher save-before-leave requests');
  assert.match(html, /saved = saveDrawingToProject\(\);/, 'LineSmith should attempt project save when launcher requests save-before-navigation');
  assert.match(html, /function\s+saveDrawingToProject\(\)\s*\{[\s\S]*return false;[\s\S]*markDrawingAsSaved\(\);[\s\S]*return true;/, 'save workflow should return explicit success status and refresh saved snapshot baseline');
  assert.match(html, /requestAnimationFrame\(draw\);[\s\S]*markDrawingAsSaved\(\);/, 'boot should initialize unsaved-change baseline before new edits occur');
});


test('VIEWPORT.HTML restores the last project drawing when launched directly with an active project', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+PROJECT_LAST_DRAWING_STORAGE_PREFIX\s*=\s*"surveyfoundryLastLineSmithDrawing"/, 'LineSmith should define a stable storage namespace for the last-opened project drawing');
  assert.match(html, /function\s+saveLastOpenedProjectDrawing\(projectId, storageKey\)/, 'LineSmith should persist the last-opened drawing key by project');
  assert.match(html, /saveLastOpenedProjectDrawing\(activeProjectId, storageKey\);/, 'LineSmith should update last-opened drawing state when a project drawing is saved or opened');
  assert.match(html, /function\s+tryRestoreLastOpenedProjectDrawing\(\)/, 'LineSmith should define a direct-launch restore helper for last-opened drawings');
  assert.match(html, /if \(queryParams\.get\("source"\)\) return false;/, 'LineSmith should only restore last-opened drawings for direct launches without source');
  assert.match(html, /const\s+restoredLastDrawing\s*=\s*tryRestoreLastOpenedProjectDrawing\(\);[\s\S]*if \(restoredLastDrawing\) \{[\s\S]*connectCollaboration\(\);[\s\S]*return;[\s\S]*\}/, 'LineSmith boot should restore last-opened drawing and then connect collaboration before showing default ready state');
});

test('VIEWPORT.HTML keeps PointForge imports from being overwritten by prior collaboration room state', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+launchSource\s*=\s*queryParams\.get\("source"\)\s*\|\|\s*"";/, 'LineSmith should cache launch source for import-aware boot decisions');
  assert.match(html, /function\s+connectCollaboration\(\{\s*skipInitialStateHydration\s*=\s*false,\s*syncLocalStateOnConnect\s*=\s*false\s*\}\s*=\s*\{\}\)\s*\{/, 'collaboration boot should accept options for initial-state hydration and local-state push');
  assert.match(html, /if \(message\.state && !skipInitialStateHydration\) \{[\s\S]*restoreState\(message\.state, \{ skipSync: true, applyView: false \}\);/, 'PointForge imports should be able to skip applying stale welcome state from collaboration room');
  assert.match(html, /if \(syncLocalStateOnConnect\) \{[\s\S]*sendCollabMessage\(\{ type: "state", state: serializeState\(\{ includeView: false \}\) \}\);/, 'PointForge imports should publish freshly imported geometry once collaboration connects');
  assert.match(html, /const\s+importedFromPointforge\s*=\s*tryImportPointforgePayload\(\);[\s\S]*if \(importedFromPointforge\) \{[\s\S]*connectCollaboration\(\{ skipInitialStateHydration: true, syncLocalStateOnConnect: true \}\);[\s\S]*return;[\s\S]*\}/, 'boot should connect collaboration after PointForge import using import-safe options');
});

test('VIEWPORT.HTML syncs collaboration state during live drag and mobile touch cursor movement', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /canvas\.addEventListener\("pointermove", \(e\) => \{[\s\S]*broadcastCursor\(\);/, 'touch pointer movement should broadcast remote cursor updates for mobile users');
  assert.match(html, /if \(mouse\.dragObj\?\.type === "point"\) \{[\s\S]*scheduleCollabStateSync\(\);[\s\S]*schedulePointsTableRender\(\);/, 'point drag should debounce-send collaboration state updates while dragging');
  assert.match(html, /if \(mouse\.dragObj\?\.type === "line"\) \{[\s\S]*scheduleCollabStateSync\(\);[\s\S]*schedulePointsTableRender\(\);/, 'line drag should debounce-send collaboration state updates while dragging');
  assert.match(html, /if \(mouse\.dragObj && mouse\.dragObj\.type !== "pan"\) \{[\s\S]*if \(!mouse\.dragObj\._moved\) \{[\s\S]*\} else \{[\s\S]*scheduleCollabStateSync\(\);/, 'drag commit should force a final collaboration state sync after movement');

  assert.match(html, /sendCollabMessage\(\{ type: "state", state: serializeState\(\{ includeView: false \}\) \}\);/, 'collaboration state sync should exclude local view pan and zoom from websocket payloads');
  assert.match(html, /if \(message\.type === "state" && message\.state\) \{[\s\S]*restoreState\(message\.state, \{ skipSync: true, applyView: false \}\);/, 'remote collaboration state restores should not overwrite local user view pan/zoom');
});
