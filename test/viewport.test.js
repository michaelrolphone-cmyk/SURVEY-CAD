import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';







test('VIEWPORT.HTML supports print-ready black and white survey excerpts with nearest standard scale selection', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="printPaperSize"/, 'print panel should allow choosing standard paper sizes');
  assert.match(html, /<option value="A4" selected>A4<\/option>/, 'print panel should default paper size to A4');
  assert.match(html, /id="printCustomWidthMm"/, 'print panel should allow entering custom paper width');
  assert.match(html, /id="printCustomHeightMm"/, 'print panel should allow entering custom paper height');
  assert.match(html, /id="generatePrintView"/, 'print panel should include a generate print view action');
  assert.match(html, /const\s+PRINT_SCALES\s*=\s*\[1,\s*5,\s*10,\s*20,\s*30,\s*40,\s*50,\s*100,\s*200,\s*500,\s*1000\]/, 'print workflow should support the requested set of survey scales');
  assert.match(html, /function\s+chooseClosestPrintScale\(bounds, paper, marginIn = 0\.5\)/, 'print workflow should compute nearest supported survey scale from selected window bounds and paper size');
  assert.match(html, /const\s+printableWidthInches\s*=\s*Math\.max\(EPS,\s*paper\.widthIn - \(marginIn \* 2\)\);[\s\S]*const\s+targetScale\s*=\s*Math\.max\(worldWidthFeet \/ printableWidthInches,\s*worldHeightFeet \/ printableHeightInches\);/, 'print scale conversion should treat engineering scales as 1 inch = N feet without converting page inches into feet first');
  assert.match(html, /function\s+beginPrintWindowCapture\(\)/, 'print panel should support an explicit draw-window capture workflow before generating preview output');
  assert.match(html, /pendingPrintWindowCapture\s*=\s*true;[\s\S]*Draw a selection window over the area to print/, 'print workflow should arm a window-capture mode and prompt the user to drag the print bounds');
  assert.match(html, /\.quickToolBtn\.printCaptureArmed\{[\s\S]*animation:printCaptureReadyPulse 1s ease-in-out infinite;/, 'quick Print icon should gain a dedicated armed highlight animation while awaiting print window drag');
  assert.match(html, /function\s+syncPrintWindowCaptureUi\(\)\s*\{[\s\S]*quickPrintBtn\?\.classList\.toggle\("printCaptureArmed", pendingPrintWindowCapture\);[\s\S]*Print Window Ready[\s\S]*Drag a selection window over the area you want to print, then release\./, 'print window capture mode should show highlighted quick-print affordance plus toast instructions for the drag-release workflow');
  assert.match(html, /if \(pendingPrintWindowCapture\) \{[\s\S]*syncPrintWindowCaptureUi\(\);[\s\S]*worldBoundsFromScreenRect\(marqueeRect\);[\s\S]*generatePrintViewFromBounds\(printBounds\);[\s\S]*applySelectionSnapshot\(selectionSnapshot\);/, 'marquee mouseup should generate print preview from drawn bounds, clear armed-state UI, and preserve the existing selection');
  assert.match(html, /function\s+generatePrintViewFromSelection\(\)\s*\{[\s\S]*generatePrintViewFromBounds\(getSelectionWorldBounds\(\)\);/, 'command-driven print generation should continue supporting selection-based print previews');
  assert.match(html, /Record of Survey Template \(Landscape Placeholder\)/, 'print generation should render selected geometry into a landscape record-of-survey placeholder template');
  assert.match(html, /window\.open\("", "_blank"\);[\s\S]*printWindow\.document\.open\(\);[\s\S]*printWindow\.document\.write\([\s\S]*window\.print\(\)/, 'print preview should open in a dedicated writable window and render printable output directly');
});
test('VIEWPORT.HTML allows map tile rendering to continue zooming past native tile limits', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+MAP_LAYER_MAX_RENDER_ZOOM\s*=\s*40\s*;/, 'LineSmith should define an extended map render zoom ceiling for over-zoom scaling beyond tile-native levels');
  assert.match(html, /maxZoom:\s*MAP_LAYER_MAX_RENDER_ZOOM/, 'LineSmith tile layers should reuse the extended render zoom ceiling so Leaflet can keep scaling raster tiles after native zoom is exhausted');
  assert.match(html, /function\s+scaleToLeafletZoomForLat\(scale, lat\)\s*\{[\s\S]*return\s+clamp\(zoom,\s*MAP_LAYER_MIN_RENDER_ZOOM,\s*MAP_LAYER_MAX_RENDER_ZOOM\);/, 'georeferenced zoom conversion should clamp against the extended map render zoom range');
  assert.match(html, /mapInstance\s*=\s*L\.map\("mapLayer",\s*\{[\s\S]*maxZoom:\s*MAP_LAYER_MAX_RENDER_ZOOM/, 'Leaflet map instance should accept the extended render zoom ceiling so setView can continue beyond tile max-native zoom');
});

test('VIEWPORT.HTML relies on the animation loop instead of legacy redraw callbacks for symbol images', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /function\s+redraw\(\)/, 'LineSmith should remove the unused redraw helper to avoid dead callback paths');
  assert.doesNotMatch(html, /image\.addEventListener\("load",\s*\(\)\s*=>\s*redraw\(\)\);/, 'symbol image load should not rely on manual redraw callbacks now that draw() runs continuously');
  assert.doesNotMatch(html, /syncFieldToFinishLinework\(\);[\s\S]*redraw\(\);/, 'FLD sync flows should not invoke redraw after linework updates');
});

test('VIEWPORT.HTML double right-click zooms out one map zoom level when nothing is selected', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+DOUBLE_RIGHT_CLICK_ZOOM_OUT_MS\s*=\s*325\s*;/, 'canvas interaction state should define a double-right-click detection window');
  assert.match(html, /function\s+leafletZoomToScaleForLat\(zoom, lat\)\s*\{[\s\S]*return\s+clamp\(1 \/ Math\.max\(1e-9, feetPerPixel\), MIN_SCALE, MAX_SCALE\);/, 'zoom-out shortcut should convert target map zoom levels back into drawing scale while respecting limits');
  assert.match(html, /function\s+nextZoomOutLeafletLevel\(currentZoom\)\s*\{[\s\S]*Math\.floor\(currentZoom\)/, 'double-right-click workflow should pick the next lower map zoom level');
  assert.match(html, /function\s+zoomOutToNextMapLevelAtScreenPoint\(screenX, screenY\)\s*\{[\s\S]*setStatus\(`Zoomed out to map zoom \$\{targetZoom\.toFixed\(0\)\}\.`, "ok"\);/, 'shortcut should anchor zoom-out at cursor location and confirm the zoom step');
  assert.match(html, /canvas\.addEventListener\("contextmenu",\s*\(e\)\s*=>\s*\{[\s\S]*const\s+isDoubleRightClick\s*=\s*now - lastRightClickAtMs <= DOUBLE_RIGHT_CLICK_ZOOM_OUT_MS;[\s\S]*if \(isDoubleRightClick && !hasSelection\(\) && !modalIsOpen\(\)\)\s*\{[\s\S]*zoomOutToNextMapLevelAtScreenPoint\(mouse\.x, mouse\.y\);/, 'right-click handler should zoom out on a double right-click only when nothing is selected');
});

test('VIEWPORT.HTML anchors pinch zoom to the initial touch midpoint so mobile map zoom does not drift', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+touchGesture\s*=\s*\{[\s\S]*startWorldAtCenter:\s*null,/, 'mobile touch gesture state should track the world coordinate under the initial pinch midpoint');
  assert.match(html, /touchGesture\.startWorldAtCenter\s*=\s*touchGesture\.startCenter[\s\S]*screenToWorld\(touchGesture\.startCenter\.x,\s*touchGesture\.startCenter\.y\)/, 'pinch start should capture the world position beneath the midpoint at gesture begin');
  assert.match(html, /if \(touchGesture\.points\.size === 2 && touchGesture\.mode === "pinch"\) \{[\s\S]*!touchGesture\.startWorldAtCenter\) return;/, 'pinch move should require a captured midpoint anchor before applying zoom math');
  assert.match(html, /const\s+rotatedAnchor\s*=\s*rotateWorldPointAroundBasis\(touchGesture\.startWorldAtCenter\.x,\s*touchGesture\.startWorldAtCenter\.y\);[\s\S]*view\.panX = center\.x - rotatedAnchor\.x \* view\.scale;[\s\S]*view\.panY = center\.y \+ rotatedAnchor\.y \* view\.scale;/, 'pinch transform should keep the anchored world midpoint under the moving gesture center while scaling');
  assert.match(html, /touchGesture\.mode = null;[\s\S]*touchGesture\.startWorldAtCenter = null;/, 'pinch anchor state should reset when touch gesture ends');
});

test('VIEWPORT.HTML includes icon-based quick toolbar shortcuts for core LineSmith actions', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\//, 'LineSmith should load a font icon set for quick toolbar buttons');
  assert.match(html, /id="quickTools"\s+class="quickTools"/, 'canvas should render a quick tools toolbar at the top of the drawing window');
  assert.match(html, /class="quickToolsRow quickToolsRowPrimary"/, 'quick toolbar should render a dedicated first row for map and layer controls');
  assert.match(html, /class="quickToolsRow quickToolsRowSecondary"/, 'quick toolbar should render a dedicated second row for draw and edit tools');
  assert.match(html, /class="quickToolsRow quickToolsRowSecondary"[\s\S]*id="quickSelect"/, 'quick toolbar second row should begin with the Select\/Move tool');
  assert.match(html, /\.quickTools\{[\s\S]*left:10px;[\s\S]*right:10px;[\s\S]*width:calc\(100% - 20px\);/, 'quick toolbar should span the full visible map width while respecting edge insets');
  assert.doesNotMatch(html, /\.app\.panelCollapsed \.quickTools\{[\s\S]*width:100%;[\s\S]*border-radius:0;/, 'quick toolbar should keep rounded floating styling when the tools drawer is collapsed');
  assert.match(html, /\.quickToolsRow\{[\s\S]*flex-wrap:wrap;/, 'each quick toolbar row should preserve wrapping behavior on narrow widths');
  assert.match(html, /\.quickToolSearch\{[\s\S]*flex:0 1 170px;[\s\S]*min-width:140px;/, 'quick toolbar search field should be compact and roughly half-width of the prior design');
  assert.match(html, /id="quickSave"[\s\S]*fa-floppy-disk/, 'quick toolbar should include Save icon shortcut');
  assert.match(html, /id="quickPrintView"[\s\S]*fa-print/, 'quick toolbar should include Print icon shortcut next to Save');
  assert.match(html, /id="quickOpenArrowHead"[\s\S]*fa-vr-cardboard/, 'quick toolbar should include Open ArrowHead shortcut');
  assert.match(html, /id="quickOpenArrowHead"[\s\S]*id="quickLayerManager"[\s\S]*id="quickLayerDropdown"/, 'quick toolbar should place the layer manager button to the left of the layer dropdown');
  assert.match(html, /id="quickShowPoints"[\s\S]*id="quickCommandSearchInput"/, 'quick toolbar should place the search-first command field after point visibility toggles');
  assert.match(html, /id="quickCommandSearchInput"[\s\S]*id="quickMapLayerEnabled"/, 'quick toolbar should move map controls to the end of the primary row');
  assert.doesNotMatch(html, /id="quickCommandSearchRun"/, 'quick toolbar search should remove the separate run/play button');
  assert.match(html, /id="quickMapLayerEnabled"\s+class="quickToggleBtn"[\s\S]*fa-map/, 'quick toolbar should include an icon-based map layer toggle');
  assert.match(html, /#quickMapLayerEnabled\{[\s\S]*width:34px;[\s\S]*height:34px;[\s\S]*padding:0;/, 'map layer toggle button should match the icon button dimensions used by the toolbar');
  assert.match(html, /\.quickLayerDropdownBtnText\{[\s\S]*text-overflow:clip;[\s\S]*white-space:nowrap;/, 'active layer dropdown label should render full layer names without ellipsis truncation');
  assert.match(html, /\.quickLayerItemName\{[\s\S]*text-overflow:clip;[\s\S]*white-space:nowrap;/, 'layer dropdown rows should render full layer names without ellipsis truncation');
  assert.match(html, /<div class="quickToolField" title="Map tiles">\s*<select id="quickMapTileType"/, 'quick toolbar should include unlabeled inline map tile type dropdown');
  assert.doesNotMatch(html, /title="Map tiles">\s*Tiles\s*</, 'quick toolbar map tile selector should not include a redundant Tiles text label');
  assert.match(html, /id="quickShowPoints"[\s\S]*fa-location-crosshairs/, 'quick toolbar should include point marker visibility icon toggle');
  assert.match(html, /id="quickShowLines"[\s\S]*fa-slash/, 'quick toolbar should include line visibility icon toggle');
  assert.match(html, /id="quickShowBearings"[\s\S]*fa-compass/, 'quick toolbar should include bearing visibility icon toggle');
  assert.match(html, /id="quickShowPointNames"[\s\S]*fa-tag/, 'quick toolbar should include point names visibility icon toggle');
  assert.match(html, /id="quickShowPointCodes"[\s\S]*fa-hashtag/, 'quick toolbar should include point code visibility icon toggle');
  assert.match(html, /id="quickShowPointNotes"[\s\S]*fa-note-sticky/, 'quick toolbar should include point notes visibility icon toggle');
  assert.match(html, /id="quickTogglePointClustering"[\s\S]*fa-circle-nodes/, 'quick toolbar should include point clustering icon toggle');
  assert.match(html, /class="quickToolField quickToolToggleGroup"/, 'quick toolbar should group point display toggles together');
  assert.match(html, /\.quickToolField\{[\s\S]*display:inline-flex;[\s\S]*flex-direction:row;/, 'quick toolbar control labels should render inline with row direction');
  assert.doesNotMatch(html, /\.quickToolField input\[type="checkbox"\][\s\S]*accent-color:/, 'quick toolbar checkboxes should keep native accent color styling');
  assert.match(html, /id="quickSelect"[\s\S]*fa-arrow-pointer/, 'quick toolbar should include Select/Move icon shortcut');
  assert.match(html, /id="quickAddPoint"[\s\S]*fa-circle-plus/, 'quick toolbar should include Add Point icon shortcut');
  assert.match(html, /id="quickLineByPoints"[\s\S]*fa-share-nodes/, 'quick toolbar should include Line by Points icon shortcut');
  assert.match(html, /id="quickUndo"[\s\S]*fa-rotate-left/, 'quick toolbar should include Undo icon shortcut');
  assert.match(html, /id="quickRedo"[\s\S]*fa-rotate-right/, 'quick toolbar should include Redo icon shortcut');
  assert.match(html, /id="quickZoomExtents"[\s\S]*fa-expand/, 'quick toolbar should include Zoom Extents icon shortcut');
  assert.doesNotMatch(html, /id="quickCenter"/, 'quick toolbar should not include Center (0,0) shortcut');
  assert.match(html, /id="quickExtend"[\s\S]*fa-up-right-and-down-left-from-center/, 'quick toolbar should include Extend icon shortcut');
  assert.match(html, /id="quickTrimIntersect"[\s\S]*fa-scissors/, 'quick toolbar should include Trim\/Intersect icon shortcut');
  assert.match(html, /id="quickOffsetLine"[\s\S]*fa-arrows-left-right/, 'quick toolbar should include Offset Selected Line icon shortcut');
  assert.match(html, /id="quickRotateSelection"[\s\S]*fa-rotate/, 'quick toolbar should include Rotate Selection icon shortcut');
  assert.match(html, /id="quickPointManager"[\s\S]*fa-list/, 'quick toolbar should include Point Manager icon shortcut');
  assert.match(html, /\.quickToolBtn\.saveSuccessPulse\{[\s\S]*animation:quickSaveSuccessPulse 420ms ease-out;/, 'quick Save icon should expose a temporary success pulse animation class');
  assert.match(html, /@keyframes quickSaveSuccessPulse\{[\s\S]*45%\{\s*transform:scale\(1\.14\);/, 'quick Save icon pulse animation should scale up midway through the success pulse');
  assert.match(html, /function\s+startLineByPointsFromToolbar\(\)\s*\{[\s\S]*if \(selectedPointIds\.length >= 2\) \{[\s\S]*runLineBetweenSelectedPoints\(\{ returnToSelectionTool: true \}\);[\s\S]*setTool\("line2pt"\);/, 'quick Line by Points should run line-between-selected when points are preselected and otherwise enter two-point draw mode');
  assert.match(html, /async\s+function\s+runLineBetweenSelectedPoints\(\{ returnToSelectionTool = false \} = \{\}\)[\s\S]*if \(returnToSelectionTool\) setTool\("select"\);/, 'line-between-selected workflow should optionally return to selection tool after completion');
  assert.match(html, /\$\("#quickSave"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#saveDrawingToProject"\)\.click\(\)\)/, 'quick Save should trigger the existing save drawing workflow');
  assert.match(html, /\$\("#quickPrintView"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#generatePrintView"\)\?\.click\(\)\)/, 'quick Print should trigger the existing draw-print-window workflow');
  assert.match(html, /\$\("#quickOpenArrowHead"\)\?\.addEventListener\("click",\s*openArrowHeadFromLineSmith\)/, 'quick Open ArrowHead should trigger existing ArrowHead handoff workflow');
  assert.match(html, /\$\("#quickExtend"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#extendToIntersect"\)\.click\(\)\)/, 'quick Extend should delegate to existing extend action');
  assert.match(html, /\$\("#quickTrimIntersect"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#trimToIntersect"\)\.click\(\)\)/, 'quick Trim\/Intersect should delegate to existing trim action');
  assert.match(html, /\$\("#quickOffsetLine"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*\$\("#offsetSelectedLine"\)\?\.click\(\)\)/, 'quick Offset should delegate to existing offset selected line action');
  assert.match(html, /\$\("#quickRotateSelection"\)\?\.addEventListener\("click",\s*\(\)\s*=>\s*startRotateSelectionSession\(\)\)/, 'quick Rotate should start reference rotate workflow');
});

test('VIEWPORT.HTML initializes layersTableDirty before any early resetLayers scheduling can run', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  const resetLayersCallIndex = html.indexOf('resetLayers();');
  const layersTableDirtyIndex = html.indexOf('var layersTableDirty = true;');

  assert.notEqual(resetLayersCallIndex, -1, 'VIEWPORT boot should still initialize layer state with resetLayers()');
  assert.notEqual(layersTableDirtyIndex, -1, 'layers table dirty flag should use a var declaration to avoid temporal dead zone access before initialization');
  assert.ok(layersTableDirtyIndex < resetLayersCallIndex, 'layers table dirty flag should initialize before resetLayers() executes');
});










test('VIEWPORT.HTML defaults point notes off, hides Select/Move workflow toast, and removes center controls', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+pointDisplayVisibility\s*=\s*\{[\s\S]*notes:\s*false[\s\S]*\}/, 'point-note label visibility should default to off');
  assert.match(html, /setPointNotesVisibility\(false\);/, 'initial point-note visibility sync should keep notes hidden by default');
  assert.match(html, /if \(activeTool === "select"\) \{[\s\S]*return null;[\s\S]*\}/, 'select tool should not provide workflow-toast payload');
  assert.doesNotMatch(html, /Select \/ Move Workflow/, 'select/move workflow toast copy should not be present');
  assert.doesNotMatch(html, /id="zoomAllAndCenter"/, 'center (0,0) panel button should be removed');
  assert.doesNotMatch(html, /id="quickCenter"/, 'center (0,0) quick-toolbar button should be removed');
});
test('VIEWPORT.HTML line ops includes offset-selected-line controls and action wiring', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /<label>Offset distance[\s\S]*<input id="lineOffsetDistance"/, 'line ops should include offset distance input in the toolbar section');
  assert.match(html, /<button id="offsetSelectedLine" class="ok">Offset Selected Line<\/button>/, 'line ops should include an offset selected line action button');
  assert.match(html, /function\s+offsetSelectedLineByDistance\(rawDistance\)\s*\{[\s\S]*history\.push\("offset selected line"\)[\s\S]*addManualLine\(aId, bId, false\)/, 'line offset action should create two offset points and a new line in history');
  assert.match(html, /\$\("#offsetSelectedLine"\)\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*offsetSelectedLineByDistance\(\$\("#lineOffsetDistance"\)\.value\)/, 'offset selected line button should read the toolbar distance input and run offset creation');
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

  assert.match(html, /ctx\.strokeStyle = isMovable\(ln\.movable\) \? "#800000" : layer\.color;/, 'unlocked lines should render maroon while normal lines follow layer color');
});
test('VIEWPORT.HTML uses quick toolbar search for point lookup and command autocomplete workflows', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="quickCommandSearchInput"\s+type="text"/, 'LineSmith should expose a compact quick-toolbar search input');
    assert.match(html, /id="quickCommandSearchResults"\s+class="quickSearchResults hidden"/, 'LineSmith should include a quick search results flyout below the toolbar search field');
  assert.match(html, /function\s+runCommandLine\(rawCommand\)/, 'LineSmith should parse and execute command input from the toolbar search field');
  assert.match(html, /const\s+COMMAND_AUTOCOMPLETE\s*=\s*\[[\s\S]*command:\s*"line"[\s\S]*command:\s*"move"[\s\S]*command:\s*"rotate"[\s\S]*command:\s*"inverse"/, 'toolbar command entry should publish command autocomplete metadata');
  assert.match(html, /function\s+buildQuickCommandSearchResults\(rawValue = ""\)\s*\{[\s\S]*isLikelyCommandQuery\(normalized\)/, 'search should route command-intent input to command autocomplete suggestions first');
  assert.match(html, /for \(const point of points\.values\(\)\) \{[\s\S]*const layer = getLayerById\(point\.layerId\);/, 'point search should resolve layer metadata via getLayerById helper to avoid undefined layer lookups');
  assert.match(html, /for \(const point of points\.values\(\)\) \{[\s\S]*String\(point\.num \|\| ""\),[\s\S]*String\(point\.code \|\| ""\),[\s\S]*String\(point\.notes \|\| ""\)/, 'search should support point lookup by number, code, and notes text');
  assert.match(html, /btn\.style\.borderLeftColor = result\.layerColor;/, 'point search result rows should be color-coded by owning layer');
  assert.match(html, /\.quickSearchResults\{[\s\S]*width:max\(100%, 420px\);[\s\S]*max-width:min\(70vw, 680px\);/, 'quick search result flyout should expand wider than the compact input so long descriptions remain visible');
  assert.match(html, /\.quickSearchResultDescription\{[\s\S]*white-space:normal;[\s\S]*overflow-wrap:anywhere;/, 'quick search descriptions should wrap instead of truncating with ellipsis');
  assert.match(html, /quickSearchResultTitle" style="color:\$\{escapeHtml\(result\.layerColor\)\}">\$\{escapeHtml\(result\.pointNumber\)\}<\//, 'point quick-search rows should display bare point numbers without a P prefix');
  assert.match(html, /function\s+selectPointFromQuickSearch\(pointId\)/, 'point search selections should route through a dedicated helper');
  assert.match(html, /setStatus\(`Selected point \$\{point\.num\} from quick search\.`, "ok"\);/, 'point search should report point selection feedback in status text');
  assert.match(html, /quickCommandSearchInput\?\.addEventListener\("keydown", \(e\) => \{[\s\S]*e\.key !== "Enter"[\s\S]*if \(!isLikelyCommandQuery\(raw\)\) return;/, 'toolbar search should only submit commands on Enter while leaving point search as live suggestions');
});
test('VIEWPORT.HTML only treats strict boolean true as movable for point/line drag', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+isMovable\(value\)\s*\{\s*return\s+value\s*===\s*true;\s*\}/, 'movable helper should require strict true');
  assert.match(html, /if \(selectedPointId === pid && isMovable\(p\?\.movable\) && !isPointLockedByLayer\(pid\)\)/, 'point drag should require strict movable true and unlocked layer');
  assert.match(html, /if \(isMovable\(ln\?\.movable\) && !isLineLockedByLayer\(lpick\.lineId\)\)\s*\{\s*history\.push\("move line"\)/, 'line drag should require strict movable true and unlocked layer');
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

test('VIEWPORT.HTML maps OS-native print shortcuts to the draw print window workflow', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /if \(\(e\.ctrlKey \|\| e\.metaKey\) && !e\.altKey && key === "p"\) \{[\s\S]*e\.preventDefault\(\);[\s\S]*\$\("#generatePrintView"\)\?\.click\(\);[\s\S]*return;/, 'Ctrl+P and Cmd+P should trigger the existing generate print view action instead of browser default print behavior');
});

test('VIEWPORT.HTML routes global typing into quick command search when no editable field is focused', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+maybeRouteKeystrokeToQuickCommandSearch\(event\)\s*\{[\s\S]*event\.key\.length !== 1[\s\S]*isEditableTarget\(event\.target\) \|\| isEditableTarget\(document\.activeElement\)/, 'global keystroke routing should only capture printable keys and skip active editable targets');
  assert.match(html, /const\s+nextValue\s*=\s*`\$\{currentValue\.slice\(0, start\)\}\$\{event\.key\}\$\{currentValue\.slice\(end\)\}`;[\s\S]*quickCommandSearchInput\.focus\(\);[\s\S]*renderQuickCommandSearchResults\(nextValue\);/, 'captured keystrokes should be inserted into quick command search and immediately show suggestions');
  assert.match(html, /window\.addEventListener\("keydown",\s*\(e\) => \{[\s\S]*if \(maybeRouteKeystrokeToQuickCommandSearch\(e\)\) return;/, 'main keydown handler should route typing to quick command search before canvas shortcuts execute');
});


test('VIEWPORT.HTML shows footer mouse coordinates in plain state-plane format', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /<span class="pill"><b>Mouse \(State Plane\)<\/b>\s*<span id="hudMouse">x: 0\.000, y: 0\.000<\/span><\/span>/, 'HUD footer should label mouse coordinates as state-plane and initialize plain decimal values');
  assert.match(html, /const\s+fmtPlainCoordinate\s*=\s*\(n\)\s*=>\s*\(Number\.isFinite\(n\)[\s\S]*toLocaleString\("en-US",\s*\{\s*useGrouping:false,\s*minimumFractionDigits:3,\s*maximumFractionDigits:3\s*\}\)/, 'LineSmith should provide a plain-number formatter for state-plane coordinates that avoids scientific notation');
  assert.match(html, /hudMouse\.textContent\s*=\s*`x: \$\{fmtPlainCoordinate\(mouse\.wx\)\}, y: \$\{fmtPlainCoordinate\(mouse\.wy\)\}`;/, 'HUD mouse readout should render state-plane coordinates using the plain-number formatter');
});
test('VIEWPORT.HTML restores persisted movable flags as strict booleans', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /points\.set\(p\.id,\s*\{\s*\.\.\.p,\s*movable:\s*isMovable\(p\.movable\),\s*layerId:\s*String\(p\.layerId \|\| selectedLayerId \|\| DEFAULT_LAYER_ID\)\s*\}\)/, 'restored points should normalize movable flags and layer ownership');
  assert.match(html, /lines\.set\(l\.id,\s*\{\s*\.\.\.l,\s*movable:\s*isMovable\(l\.movable\),\s*layerId:\s*String\(l\.layerId \|\| selectedLayerId \|\| DEFAULT_LAYER_ID\)\s*\}\)/, 'restored lines should normalize movable flags and layer ownership');
});

test('VIEWPORT.HTML moves current selection to the chosen toolbar layer', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+moveSelectionToLayer\(layerId\)\s*\{[\s\S]*point\.layerId = targetLayerId;[\s\S]*line\.layerId = targetLayerId;/, 'layer switch should include a helper that reassigns selected points and selected lines to the chosen layer');
  assert.match(html, /function\s+applyLayerChoice\(layerId,\s*\{\s*closeDropdown = false\s*\}\s*=\s*\{\}\)\s*\{[\s\S]*if \(hasSelection\(\)\) \{[\s\S]*moveSelectionToLayer\(layerId\);/, 'layer selection should route through a shared handler that moves selected entities before setting active layer');
  assert.match(html, /rowBtn\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*applyLayerChoice\(layer\.id,\s*\{\s*closeDropdown:\s*true\s*\}\);\s*\}\);/, 'quick toolbar layer picker should use the layer application handler so selected entities move immediately');
  assert.match(html, /useBtn\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*applyLayerChoice\(layer\.id\);\s*\}\);/, 'layer manager Use action should use the same selection-moving layer handler for consistent behavior');
});

test('VIEWPORT.HTML adds a mobile toggle for hiding quick toolbars', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="quickTools"[\s\S]*quickToolsMobileRow[\s\S]*id="mobileToolbarToggle"[\s\S]*id="drawerToggle"/, 'mobile hide-bars and tools buttons should live in a dedicated quick-toolbar row to avoid overlaying toolbar actions');
  assert.match(html, /@media \(max-width: 960px\) \{[\s\S]*\.quickToolsMobileRow\{ display:flex; \}[\s\S]*\.drawerToggle,[\s\S]*\.mobileToolbarToggle\{ display:inline-flex;/, 'mobile-only toolbar controls should only be visible on narrow viewports');
  assert.match(html, /\.app\.mobileToolbarsHidden \.quickTools \.quickToolsRowPrimary,[\s\S]*\.app\.mobileToolbarsHidden \.quickTools \.quickToolsRowSecondary\{ display:none; \}/, 'mobile hidden state should collapse quick toolbar rows while preserving access to mobile control buttons');
  assert.match(html, /function\s+setMobileToolbarsHidden\(hidden\)\s*\{[\s\S]*mobileToolbarToggle\.textContent = shouldHide \? "Show Bars" : "Hide Bars";[\s\S]*mobileToolbarToggle\.setAttribute\("aria-pressed", shouldHide \? "true" : "false"\);/, 'toolbar hide helper should synchronize app-shell classes and button accessibility state');
  assert.match(html, /mobileToolbarToggle\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*setMobileToolbarsHidden\(!mobileToolbarsHidden\);[\s\S]*\}\);/, 'mobile toolbar toggle should switch visibility state each tap');
});


test('VIEWPORT.HTML preserves unchanged array entries in drawing diffs', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /if \(child === undefined\) \{[\s\S]*out\[i\] = \{ __unchanged: true \};/, 'array diffing should mark unchanged entries with a serializable sentinel');
  assert.match(html, /if \(diff\.__unchanged\) return deepClone\(base\);/, 'diff apply should restore unchanged sentinel entries from prior state');
});


test('VIEWPORT.HTML provides toggles for point markers, names, codes, notes, and clustering', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="showPoints"\s+type="checkbox"\s+checked/, 'display section should include a checked point markers toggle');
  assert.match(html, /id="showPointNames"\s+type="checkbox"\s+checked/, 'display section should include a checked point names toggle');
  assert.match(html, /id="showPointCodes"\s+type="checkbox"\s+checked/, 'display section should include a checked point code toggle');
  assert.match(html, /id="showPointNotes"\s+type="checkbox"(?!\s+checked)/, 'display section should include a point notes toggle defaulted off');
  assert.match(html, /id="enablePointClustering"\s+type="checkbox"\s+checked/, 'display section should include a checked point clustering toggle');
  assert.match(html, /if \(pointDisplayVisibility\.points\) \{[\s\S]*ctx\.moveTo\(sp\.x-5, sp\.y-5\)/, 'point marker draw should be gated by point marker visibility toggle');
  assert.match(html, /if \(pointDisplayVisibility\.names\) \{[\s\S]*const numText = String\(p\.num\);/, 'point name draw should be gated by point name visibility toggle');
  assert.match(html, /if \(pointDisplayVisibility\.codes && p\.code\)/, 'code labels should render only when the code toggle is enabled');
  assert.match(html, /if \(pointDisplayVisibility\.notes && p\.notes\)/, 'notes labels should render only when the notes toggle is enabled');
  assert.match(html, /if \(!pointDisplayVisibility\.points \|\| !pointDisplayVisibility\.clustering\) return \[\];/, 'point clustering should disable cluster generation when points or clustering are hidden');
  assert.match(html, /showPointsInput\?\.addEventListener\("change"/, 'point marker visibility toggle should be wired to change events');
  assert.match(html, /quickShowPointsBtn\?\.addEventListener\("click"/, 'quick toolbar point marker toggle should be wired to click events');
  assert.match(html, /showPointNamesInput\?\.addEventListener\("change"/, 'point name visibility toggle should be wired to change events');
  assert.match(html, /showLinesInput\?\.addEventListener\("change"/, 'line visibility toggle should be wired to change events');
  assert.match(html, /quickShowLinesBtn\?\.addEventListener\("click"/, 'quick toolbar line visibility toggle should be wired to click events');
  assert.match(html, /showBearingsInput\?\.addEventListener\("change"/, 'bearing visibility toggle should be wired to change events');
  assert.match(html, /quickShowBearingsBtn\?\.addEventListener\("click"/, 'quick toolbar bearing visibility toggle should be wired to click events');
  assert.match(html, /quickShowPointNamesBtn\?\.addEventListener\("click"/, 'quick toolbar point names toggle should be wired to click events');
  assert.match(html, /showPointCodesInput\?\.addEventListener\("change"/, 'code visibility toggle should be wired to change events');
  assert.match(html, /quickShowPointCodesBtn\?\.addEventListener\("click"/, 'quick toolbar code toggle should be wired to click events');
  assert.match(html, /showPointNotesInput\?\.addEventListener\("change"/, 'notes visibility toggle should be wired to change events');
  assert.match(html, /quickShowPointNotesBtn\?\.addEventListener\("click"/, 'quick toolbar notes toggle should be wired to click events');
  assert.match(html, /enablePointClusteringInput\?\.addEventListener\("change"/, 'clustering visibility toggle should be wired to change events');
  assert.match(html, /quickTogglePointClusteringBtn\?\.addEventListener\("click"/, 'quick toolbar clustering toggle should be wired to click events');
});



test('VIEWPORT.HTML quick point search selection zooms to 10 px per unit before centering', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+QUICK_SEARCH_POINT_SCALE\s*=\s*10\s*;/, 'quick point search should define a fixed zoom target of 10 px per unit');
  assert.match(html, /function\s+selectPointFromQuickSearch\(pointId\)\s*\{[\s\S]*view\.scale\s*=\s*clamp\(QUICK_SEARCH_POINT_SCALE,\s*MIN_SCALE,\s*MAX_SCALE\);[\s\S]*centerViewOnPoint\(point\);/, 'quick point search selection should apply the fixed zoom target before recentering to the selected point');
});

test('VIEWPORT.HTML renders conditional line labels and avoids text collisions', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+lineLabelCandidates\s*=\s*\[\]/, 'draw loop should gather line label candidates');
  assert.match(html, /pointDisplayVisibility\s*=\s*\{[\s\S]*lines:\s*true,[\s\S]*bearings:\s*true,/, 'display state should default line and bearing rendering to visible');
  assert.match(html, /id="showLines"\s+type="checkbox"\s+checked/, 'display controls should include a default-on draw lines checkbox');
  assert.match(html, /id="showBearings"\s+type="checkbox"\s+checked/, 'display controls should include a default-on draw bearings checkbox');
  assert.match(html, /if \(pointDisplayVisibility\.lines\) \{[\s\S]*for \(const ln of lines\.values\(\)\)/, 'line rendering loop should be gated behind line visibility state');
  assert.match(html, /if \(pointDisplayVisibility\.bearings\) \{[\s\S]*const\s+groups\s*=\s*buildBearingLabelGroups\(lineLabelCandidates\);/, 'bearing label drawing should be gated behind bearing visibility state');
  assert.match(html, /const\s+groupLabelWidth\s*=\s*ctx\.measureText\(groupLabel\)\.width;/, 'line labels should measure grouped bearing labels before placement');
  assert.match(html, /blockedTextRects\.some\(\(r\) => rectsOverlap\(r, groupAabb\)\)/, 'line labels should skip drawing when they overlap existing text bounds');
});

test('VIEWPORT.HTML draws a light leader line from a single selected point to the cursor', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /if \(selectedPointIds\.length === 1\) \{[\s\S]*selectedPointScreen = worldToScreen\(selectedPoint\.x, selectedPoint\.y\);/, 'draw loop should detect exactly one selected point and convert it to screen coordinates');
  assert.match(html, /ctx\.lineWidth = 1;[\s\S]*const\s+leaderGradient\s*=\s*ctx\.createLinearGradient\(mouse\.x, mouse\.y, selectedPointScreen\.x, selectedPointScreen\.y\);[\s\S]*leaderGradient\.addColorStop\(0, "rgba\(220,220,220,0\.82\)"\);[\s\S]*leaderGradient\.addColorStop\(1, "rgba\(220,220,220,0\)"\);[\s\S]*ctx\.strokeStyle = leaderGradient;/, 'leader line should render as a thin light-gray gradient tail that fades out at the selected point');
  assert.match(html, /ctx\.moveTo\(selectedPointScreen\.x, selectedPointScreen\.y\);[\s\S]*ctx\.lineTo\(mouse\.x, mouse\.y\);/, 'leader line should connect the selected point to the current cursor location');
});

test('VIEWPORT.HTML right-click marquee zoom uses the latest cursor position and includes window padding', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+\{\s*skipHistory\s*=\s*false,\s*silent\s*=\s*false,\s*extentPaddingFraction\s*=\s*0\.06\s*\}\s*=\s*options;/, 'zoom-window helper should expose a configurable extent padding amount so window zoom keeps geometry comfortably in frame');
  assert.match(html, /const\s+padX\s*=\s*Math\.max\(EPS,\s*\(maxX - minX\) \* extentPaddingFraction\);[\s\S]*const\s+paddedMinX\s*=\s*minX - padX;[\s\S]*const\s+paddedMaxX\s*=\s*maxX \+ padX;/, 'zoom-window helper should expand X extents before computing zoom scale');
  assert.match(html, /const\s+padY\s*=\s*Math\.max\(EPS,\s*\(maxY - minY\) \* extentPaddingFraction\);[\s\S]*const\s+paddedMinY\s*=\s*minY - padY;[\s\S]*const\s+paddedMaxY\s*=\s*maxY \+ padY;/, 'zoom-window helper should expand Y extents before computing zoom scale');
  assert.match(html, /if \(mouse\.dragObj\?\.type === "marquee"\) \{[\s\S]*mouse\.dragObj\.x1 = mouse\.x;[\s\S]*mouse\.dragObj\.y1 = mouse\.y;[\s\S]*zoomToScreenRect\(windowRect\);/, 'right-click marquee zoom should commit the current cursor endpoint before computing window extents while drag is still active');
  assert.match(html, /const\s+selectionSnapshot\s*=\s*captureSelectionSnapshot\(\);[\s\S]*const\s+marqueeRect\s*=\s*rectNorm\(mouse\.dragObj\.x0, mouse\.dragObj\.y0, mouse\.dragObj\.x1, mouse\.dragObj\.y1\);[\s\S]*pendingMarqueeZoomRect\s*=\s*marqueeRect;[\s\S]*pendingMarqueeSelectionSnapshot\s*=\s*selectionSnapshot;[\s\S]*applyMarqueeSelection\(mouse\.dragObj\);/, 'marquee mouseup should cache both the drawn window and the prior selection so follow-up right-click zoom can restore selection');
  assert.match(html, /const\s+pendingWindowRect\s*=\s*consumePendingMarqueeZoomRect\(\);[\s\S]*if \(pendingWindowRect\) \{[\s\S]*zoomToScreenRect\(pendingWindowRect\);[\s\S]*applySelectionSnapshot\(consumePendingMarqueeSelectionSnapshot\(\)\);/, 'right-click should prioritize cached marquee-window zoom and restore the pre-window selection before falling back to cancel/clear behavior');
  assert.match(html, /function\s+captureSelectionSnapshot\(\)\s*\{[\s\S]*selectedPointIds:\s*\[\.\.\.selectedPointIds\],[\s\S]*selectedLines:\s*selectedLines\.map\(\(entry\)\s*=>\s*\(\{\s*\.\.\.entry\s*\}\)\),/, 'LineSmith should snapshot selected points and lines before marquee selection so zoom-only right-click can keep user selection state intact');
});

test('VIEWPORT.HTML includes line inspector card for selected line or two points', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="lineInspector"\s+class="inspectorCard"/, 'selection panel should include the line inspector card');
  assert.match(html, /else if \(selectedPointIds\.length === 2\)/, 'inspector should support computing measurements from two selected points');
  assert.match(html, /lineInspector\.innerHTML\s*=\s*[\s\S]*Distance[\s\S]*Bearing/, 'inspector should render distance and bearing rows');
  assert.match(html, /function\s+describeThreePointCurve\(line\)/, 'inspector should expose a dedicated curve-table calculator for 3-point curves');
  assert.match(html, /if \(curveTable\) \{[\s\S]*Radius[\s\S]*Arc Length[\s\S]*Chord Bearing[\s\S]*Chord Distance[\s\S]*Delta Angle/, 'inspector should append the curve table rows when a 3-point curve line is selected');
});


test('VIEWPORT.HTML exposes map backdrop controls with expected defaults and wiring', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="mapLayerEnabled"\s+type="checkbox"/, 'display section should include a map enable toggle');
  assert.match(html, /id="mapTileType"[\s\S]*value="satellite"\s+selected/, 'map tile selector should default to satellite');
  assert.match(html, /id="mapOpacity"\s+type="range"\s+min="0"\s+max="100"[\s\S]*value="66"/, 'map opacity slider should default to 66 percent');
  assert.match(html, /const\s+mapLayerState\s*=\s*\{[\s\S]*enabled:\s*false,[\s\S]*tileType:\s*"satellite",[\s\S]*opacity:\s*0\.66/, 'map state should initialize disabled with satellite and 66 percent opacity');
  assert.match(html, /id="mapBackdrop"\s+class="mapBackdrop"/, 'canvas area should include a dedicated map backdrop container behind the drawing canvas');
  assert.match(html, /mapEnabledInput\.addEventListener\("change",\s*\(\)\s*=>\s*\{[\s\S]*setMapLayerEnabled\(mapEnabledInput\.checked\)/, 'map toggle should be wired to set enabled state');
  assert.match(html, /quickMapEnabledBtn\?\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*setMapLayerEnabled\(!mapLayerState\.enabled\)/, 'quick toolbar map icon toggle should be wired to invert enabled state');
  assert.match(html, /mapTileTypeInput\.addEventListener\("change"[\s\S]*setMapTileType\(mapTileTypeInput\.value\)/, 'map tile selector should update current tileset');
  assert.match(html, /quickMapTileTypeInput\?\.addEventListener\("change"[\s\S]*setMapTileType\(quickMapTileTypeInput\.value\)/, 'quick toolbar map tile selector should update current tileset');
  assert.match(html, /mapOpacityInput\.addEventListener\("input"[\s\S]*mapLayerState\.opacity\s*=\s*clamp\(parseNum\(mapOpacityInput\.value,\s*10\)\s*\/\s*100,\s*0,\s*1\)/, 'opacity slider should update map backdrop opacity');
  assert.match(html, /function\s+zoomExtents\(options\s*=\s*\{\}\)/, 'zoom extents helper should accept options for silent and history-safe recentering');
  assert.match(html, /function\s+setMapLayerEnabled\(enabled\)\s*\{[\s\S]*if \(mapLayerState\.enabled\) \{[\s\S]*ensureMapLayer\(\);[\s\S]*syncMapBackdropVisibility\(\);[\s\S]*syncMapToView\(true\);/, 'enabling map layer should initialize Leaflet, animate visibility, and sync to the current drawing viewport');
  assert.doesNotMatch(html, /function\s+setMapLayerEnabled\(enabled\)\s*\{[\s\S]*zoomExtents\(\{ skipHistory: true, silent: true \}\);/, 'enabling map layer should not force a zoom-extents recenter');
  assert.match(html, /satellite:[\s\S]*maxNativeZoom:\s*19,[\s\S]*maxZoom:\s*MAP_LAYER_MAX_RENDER_ZOOM/, 'satellite tiles should allow overzooming beyond native coverage');
  assert.match(html, /osmStandard:[\s\S]*maxNativeZoom:\s*19,[\s\S]*maxZoom:\s*MAP_LAYER_MAX_RENDER_ZOOM/, 'OSM standard tiles should allow overzooming beyond native coverage');
  assert.match(html, /osmHumanitarian:[\s\S]*maxNativeZoom:\s*19,[\s\S]*maxZoom:\s*MAP_LAYER_MAX_RENDER_ZOOM/, 'OSM humanitarian tiles should allow overzooming beyond native coverage');
  assert.match(html, /osmCycle:[\s\S]*maxNativeZoom:\s*17,[\s\S]*maxZoom:\s*MAP_LAYER_MAX_RENDER_ZOOM/, 'OpenTopoMap tiles should overzoom from their lower native max zoom');
});




test('VIEWPORT.HTML clusters nearby points with hover details, double-click zoom, and spread labels', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+POINT_CLUSTER_DISTANCE_PX\s*=\s*18\s*;/, 'LineSmith should define a screen-space clustering threshold for super-close points');
  assert.match(html, /const\s+POINT_CLUSTER_LABEL_BREAKOUT_LIMIT\s*=\s*5\s*;/, 'LineSmith should cap radial point-number breakout labels once a cluster exceeds five points');
  assert.match(html, /if \(!pointDisplayVisibility\.names \|\| cluster\.members\.length > POINT_CLUSTER_LABEL_BREAKOUT_LIMIT\) continue;/, 'cluster markers should skip radial point-number breakout labels when cluster size is above the configured cap');
  assert.match(html, /const\s+POINT_CLUSTER_TOOLTIP_GROUP_BY_LAYER_LIMIT\s*=\s*10\s*;/, 'LineSmith should define when cluster tooltip detail switches from per-point to per-layer summaries');
  assert.match(html, /const\s+POINT_CLUSTER_TOOLTIP_HIDE_DELAY_MS\s*=\s*180\s*;/, 'cluster tooltip exit behavior should provide a short delay to allow moving into the tooltip while sketching lines');
  assert.match(html, /const\s+POINT_CLUSTER_MIN_STROKE_ALPHA\s*=\s*0\.25\s*;/, 'cluster outlines should define a minimum 25% opacity for lower-magnitude groups');
  assert.match(html, /const\s+POINT_CLUSTER_MAX_STROKE_ALPHA\s*=\s*0\.7\s*;/, 'cluster outlines should define a maximum 70% opacity for higher-magnitude groups');
  assert.match(html, /const\s+POINT_CLUSTER_COUNT_TEXT_FILL_ALPHA\s*=\s*0\.98\s*;/, 'cluster count labels should keep a near-opaque fill for readability independent of cluster opacity');
  assert.match(html, /const\s+POINT_CLUSTER_COUNT_TEXT_STROKE_ALPHA\s*=\s*0\.9\s*;/, 'cluster count labels should use a strong dark outline for contrast on translucent clusters');
  assert.match(html, /const\s+POINT_CLUSTER_POLYGON_AREA_RATIO_TARGET\s*=\s*0\.5\s*;/, 'cluster boundary rendering should target hull area around half of the cluster bounding box area');
  assert.match(html, /const\s+POINT_CLUSTER_POLYGON_MIN_WIDTH_TO_HEIGHT_RATIO\s*=\s*1\s*\/\s*3\s*;/, 'cluster boundary rendering should require a minimum width-to-height ratio of 1:3 before polygon rendering is allowed');
  assert.match(html, /cluster\.members\.length > POINT_CLUSTER_TOOLTIP_GROUP_BY_LAYER_LIMIT[\s\S]*countsByLayer/, 'cluster tooltip should aggregate large cluster details by drawing layer');
  assert.match(html, /<li><button type="button" class="clusterTooltipAction" data-cluster-action="expand-layer" data-layer-id="\$\{escapeHtml\(layerId\)\}"><b class="clusterTooltipLayerName" style="color:\$\{escapeHtml\(meta\.color\)\}">\$\{escapeHtml\(meta\.name\)\}<\/b>: \$\{meta\.count\} point\$\{meta\.count === 1 \? "" : "s"\}<\/button><\/li>/, 'large cluster tooltip layer groups should remain colorized and clickable for drill-in');
  assert.match(html, /<li\$\{activeClass\}><button type="button" class="clusterTooltipAction" data-cluster-action="select-point" data-point-id="\$\{escapeHtml\(point\.id\)\}"><span class="clusterTooltipPointRow">\$\{pointSymbolHtml\}<b class="clusterTooltipPointName" style="color:\$\{escapeHtml\(layerColor\)\}">\$\{escapeHtml\(point\.num\)\}<\/b>\$\{code\}<\/span><\/button><\/li>/, 'small cluster tooltip point names should use their layer color, optional symbol badge, and remain directly selectable');
  assert.match(html, /function\s+buildPointClusters\(\)/, 'LineSmith should build dynamic point clusters for nearby points');
  assert.match(html, /const\s+markerRadius\s*=\s*10\s*\+\s*Math\.max\(0,\s*countText\.length\s*-\s*2\)\s*\*\s*3\s*;/, 'cluster marker radius should stay fixed by count-text width rather than scaling by cluster population');
  assert.match(html, /cluster\.strokeAlpha\s*=\s*POINT_CLUSTER_MIN_STROKE_ALPHA\s*\+\s*normalized\s*\*\s*\(POINT_CLUSTER_MAX_STROKE_ALPHA\s*-\s*POINT_CLUSTER_MIN_STROKE_ALPHA\)/, 'cluster opacity should interpolate between min and max alpha based on group magnitude');
  assert.match(html, /const\s+hullPoints\s*=\s*buildConvexHull\(members\.map\(\(member\)\s*=>\s*\(\{ x: member\.sx, y: member\.sy \}\)\)\);/, 'cluster generation should derive a convex hull boundary from member screen points');
  assert.match(html, /const\s+shouldRenderAsPolygon\s*=\s*hullPoints\.length >= 3[\s\S]*POINT_CLUSTER_POLYGON_MIN_WIDTH_TO_HEIGHT_RATIO[\s\S]*POINT_CLUSTER_POLYGON_AREA_RATIO_TARGET/, 'cluster shape selection should require hull geometry, width-to-height ratio, and near-half bounding-box area ratio');
  assert.match(html, /id="clusterTooltip"\s+class="clusterTooltip\s+hidden"/, 'LineSmith should include a dedicated tooltip container for hover cluster membership lists');
  assert.match(html, /id="pointHoverTooltip"\s+class="clusterTooltip\s+hidden"/, 'LineSmith should include a dedicated tooltip container for single-point hover details');
  assert.match(html, /function\s+shouldShowPointHoverTooltip\(\)\s*\{\s*return !pointDisplayVisibility\.names \|\| !pointDisplayVisibility\.codes \|\| selectedPointIds\.length === 1;\s*\}/, 'single-point hover tooltip should activate when names or codes are hidden or when exactly one point is selected');
  assert.match(html, /\.pointHoverTooltipFromPill\{[\s\S]*color:#121212;/, 'single-point hover tooltip source-point pill should force dark text for readability on light layer colors');
  assert.match(html, /function\s+showPointHoverTooltip\(point,\s*screenX\s*=\s*mouse\.x,\s*screenY\s*=\s*mouse\.y\)\s*\{[\s\S]*const\s+pointDelta\s*=\s*basePoint && basePoint\.id !== point\.id \? lineMeasurement\(point, basePoint\) : null;/, 'single-point hover tooltip should compute inverse measurements from the hovered point back to the selected point');
  assert.match(html, /pointHoverTooltipDelta[\s\S]*Distance:[\s\S]*toFixed\(2\)\}' from[\s\S]*pointHoverTooltipFromPill[\s\S]*Bearing:/, 'single-point hover tooltip should render the inset distance-and-bearing block with a layer-colored source-point pill');
  assert.match(html, /function\s+showClusterTooltip\(cluster,\s*screenX\s*=\s*mouse\.x,\s*screenY\s*=\s*mouse\.y,\s*options\s*=\s*\{\}\)/, 'LineSmith should render clustered point membership details on hover');
  assert.match(html, /if \(cluster\) \{[\s\S]*showClusterTooltip\(cluster\);[\s\S]*hidePointHoverTooltip\(\);[\s\S]*\} else \{[\s\S]*const\s+pid\s*=\s*pointDisplayVisibility\.points\s*\?\s*pickPoint\(mouse\.x,\s*mouse\.y,\s*10\)\s*:\s*null;[\s\S]*showPointHoverTooltip\(points\.get\(pid\),\s*mouse\.x,\s*mouse\.y\);/, 'hover handling should prioritize cluster tooltips and fall back to single-point details when tooltip display conditions are met');
  assert.match(html, /let\s+hoveredClusterPointId\s*=\s*null\s*;/, 'LineSmith should track the hovered member within a clustered marker');
  assert.match(html, /function\s+getClusterMemberClosestToScreen\(cluster,\s*screenX,\s*screenY\)/, 'cluster hover should resolve the closest member point to the current cursor position');
  assert.match(html, /const\s+activeClass\s*=\s*point\.id === hoveredClusterPointId \? " class=\\"active\\"" : "";/, 'cluster tooltip point rows should mark the hovered member as active in the list');
  assert.match(html, /if \(hoveredClusterPointId != null && points\.has\(hoveredClusterPointId\)\) \{[\s\S]*ctx\.arc\(hoveredPointScreen\.x, hoveredPointScreen\.y, 10, 0, Math\.PI \* 2\);/, 'LineSmith should draw a map highlight ring for the hovered cluster member point');
  assert.match(html, /const\s+cluster\s*=\s*pointDisplayVisibility\.clustering\s*\?\s*getPointClusterAtScreen\(mouse\.x,\s*mouse\.y\)\s*:\s*null;[\s\S]*if \(cluster\) \{[\s\S]*showClusterTooltip\(cluster\);[\s\S]*\} else \{[\s\S]*if \(isLineDrawingToolActive\(\) && activeClusterTooltip\.cluster\) \{[\s\S]*scheduleClusterTooltipHide\(\);[\s\S]*\} else \{[\s\S]*hideClusterTooltip\(\);/, 'cluster hover exit should keep tooltip alive briefly while line drawing so users can move onto tooltip actions');
  assert.match(html, /clusterTooltip\?\.addEventListener\("click", \(event\) => \{[\s\S]*action === "expand-layer"[\s\S]*showClusterTooltip\(activeClusterTooltip\.cluster, mouse\.x, mouse\.y, \{ expandedLayerId: layerId \}\);[\s\S]*action === "show-layer-groups"[\s\S]*showClusterTooltip\(activeClusterTooltip\.cluster, mouse\.x, mouse\.y, \{ expandedLayerId: null \}\);[\s\S]*action !== "select-point"[\s\S]*handleCanvasPrimaryAction\(\{ forcedPointId: pointId \}\);/, 'cluster tooltip should support drilling into layer groups and selecting explicit points from the tooltip');
  assert.match(html, /function\s+handleCanvasPrimaryAction\(\{ additive = false, forcedPointId = null \} = \{\}\) \{[\s\S]*const\s+pid\s*=\s*forcedPointId != null \? forcedPointId : pickPoint\(mouse\.x, mouse\.y, 10\);/, 'primary canvas action handler should accept forced point picks so tooltip-driven line connections can target clustered points');
  assert.match(html, /const\s+cluster\s*=\s*pointDisplayVisibility\.clustering\s*\?\s*getPointClusterAtScreen\(mouse\.x,\s*mouse\.y\)\s*:\s*null;[\s\S]*selectedPointIds\s*=\s*\[\];[\s\S]*selectedPointId\s*=\s*null;[\s\S]*selectedLines\s*=\s*\[\];[\s\S]*lastSelectedLineId\s*=\s*null;[\s\S]*zoomToWorldBounds\(cluster\.minX,\s*cluster\.minY,\s*cluster\.maxX,\s*cluster\.maxY,\s*\{\s*paddingFraction:\s*0\.15\s*\}\);/, "double-clicking a cluster should clear selection and zoom to that cluster with 15% padding");
  assert.match(html, /const\s+labelRadius\s*=\s*POINT_LABEL_SPREAD_RADIUS_PX\s*\+\s*Math\.min\(20,\s*cluster\.members\.length\s*\*\s*2\);/, 'small clustered groups should spread out number labels radially to prevent overlap');
  assert.match(html, /if \(cluster\.renderAsPolygon && cluster\.hullPoints\?\.length >= 3\) \{[\s\S]*isPointInPolygon\(\{ x: screenX, y: screenY \}, cluster\.hullPoints, POINT_CLUSTER_PICK_PADDING_PX\)/, 'cluster hit-testing should use polygon containment checks when polygon boundaries are rendered');
  assert.match(html, /if \(cluster\.renderAsPolygon && cluster\.hullPoints\?\.length >= 3\) \{[\s\S]*ctx\.moveTo\(cluster\.hullPoints\[0\]\.x, cluster\.hullPoints\[0\]\.y\);[\s\S]*ctx\.closePath\(\);[\s\S]*\} else \{[\s\S]*ctx\.arc\(cluster\.centerX, cluster\.centerY, cluster\.markerRadius, 0, Math\.PI \* 2\);/, 'cluster rendering should draw polygon outlines when shape rules pass and fall back to circle markers otherwise');
  assert.match(html, /ctx\.strokeText\(clusterCountText, cluster\.centerX, cluster\.centerY\);[\s\S]*ctx\.fillText\(clusterCountText, cluster\.centerX, cluster\.centerY\);/, 'cluster count labels should render outlined text to stay legible while preserving opacity-scaled cluster shapes');
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


test('VIEWPORT.HTML parses JPN references and auto-connects matching point numbers during import', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.ok(html.includes('const regex = /\\bJPN\\s*([A-Za-z0-9]+)\\b/gi;'), 'LineSmith should parse JPN code tokens with optional whitespace and alphanumeric suffixes');
  assert.match(html, /while\s*\(match\)\s*\{[\s\S]*commands\.push\(\{ type: "join-point-number", targetPointNumber: target \}\);[\s\S]*match\s*=\s*regex\.exec\(raw\);/, 'JPN parser should collect each code reference in a point code string');
  assert.match(html, /function\s+buildExpectedJpnLineCommands\(\)\s*\{[\s\S]*extractJpnTargetPointNumbers\(sourcePoint\.code\)[\s\S]*commands\.push\(\{ a: sourcePoint\.id, b: targetPointId, type: \"jpn\", sourcePointId: sourcePoint\.id \}\);/, 'LineSmith should derive expected JPN linework commands between source points and referenced targets');
  assert.match(html, /function\s+connectFieldToFinishLinework\(\)\s*\{[\s\S]*syncFieldToFinishLinework\(\);[\s\S]*jpnLinesAdded:\s*addedJpn,\s*sequentialLinesAdded:\s*addedSequential,\s*curveLinesAdded:\s*addedCurve/, 'LineSmith should route linework command execution through field-to-finish linework synchronization');
  assert.match(html, /function\s+syncFieldToFinishLinework\(\)\s*\{[\s\S]*ensureLegacyAutoFieldToFinishLineMetadata\(\);[\s\S]*const\s+curveCommands\s*=\s*buildFieldToFinishCurveLineCommands\(\);/, 'field-to-finish sync should always backfill legacy auto-line metadata before evaluating PC/PT curve commands');
  assert.match(html, /function\s+resolveAutoLineLayerId\(aPointId, bPointId, \{ type = "sequential", baseCode = "", sourcePointId = null \} = \{\}\)\s*\{[\s\S]*if \(aLayerId && aLayerId === bLayerId\) return aLayerId;[\s\S]*if \(type === "jpn"\) \{[\s\S]*return sourceLayerId;[\s\S]*fieldToFinishRuleState\.codeLayers\.get\(baseCode\);/, 'LineSmith should resolve auto-generated line layers from same-layer endpoints, JPN source codes, and FLD linework base-code layers');
  assert.match(html, /const\s+\{\s*jpnLinesAdded,\s*sequentialLinesAdded,\s*curveLinesAdded\s*\}\s*=\s*connectFieldToFinishLinework\(\);[\s\S]*JPN lines added: \$\{jpnLinesAdded\}[\s\S]*Field-to-finish sequential lines added: \$\{sequentialLinesAdded\}[\s\S]*Field-to-finish curve segments added: \$\{curveLinesAdded\}/, 'CSV import completion status should report both JPN and field-to-finish sequential line counts');
});

test('VIEWPORT.HTML parses generic field-to-finish commands for sequential BEG/END/CLO workflows', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+fieldToFinishCommandParsers\s*=\s*\[/, 'LineSmith should maintain a registry of field-to-finish command parsers for extensible code-token handling');
  assert.match(html, /const\s+fieldToFinishRuleState\s*=\s*\{[\s\S]*lineworkCodes:\s*new\s+Set\(\),[\s\S]*symbolCodes:\s*new\s+Set\(\),[\s\S]*codeLayers:\s*new\s+Map\(\),[\s\S]*lineworkCompanionCodes:\s*new\s+Map\(\),[\s\S]*companionToLineworkCodes:\s*new\s+Map\(\)/, 'LineSmith should maintain FLD-derived code classes, configured layers, and companion-code lookups for field-to-finish behavior');
  assert.match(html, /function\s+isLineworkEntityType\(entityType\)\s*\{[\s\S]*normalized === "2" \|\| normalized === "1";/, 'LineSmith should classify both standard linework and 2D polyline entity types as linework');
  assert.match(html, /function\s+deriveFieldToFinishCodeSetsFromConfig\(config\)\s*\{[\s\S]*if \(isLineworkEntityType\(entityType\)\) lineworkCodes\.add\(code\);[\s\S]*if \(entityType === "0"\) symbolCodes\.add\(code\);[\s\S]*lineworkCompanionCodes\.set\(code, new Set\(normalizedCompanions\)\);[\s\S]*companionToLineworkCodes\.get\(companionCode\)\.add\(code\);/, 'LineSmith should derive linework, symbol, and companion-code classes from FLD entity definitions instead of hardcoded point-code values');
  assert.match(html, /await\s+loadFieldToFinishRulesFromFld\(defaultFldConfigPath\);/, 'LineSmith boot should load FLD field-to-finish rules before import workflows run');
  assert.match(html, /function\s+loadFieldToFinishRulesFromFld\(path\s*=\s*defaultFldConfigPath\)\s*\{[\s\S]*fetchFieldToFinishSettingsFromApi\(\)/, 'LineSmith should fetch shared FLD settings from the CRUD API so all users and projects stay in sync');
  assert.match(html, /\{\s*type:\s*"sequential-line",[\s\S]*const\s+directives\s*=\s*new\s+Set\(\["BEG",\s*"END",\s*"CLO"\]\)/, 'field-to-finish parser should recognize sequential line directives BEG, END, and CLO');
  assert.match(html, /for \(let i = 0; i < tokensUpper\.length; i\+\+\) \{[\s\S]*const action = tokensUpper\[i\];[\s\S]*const baseCode = resolveSequentialDirectiveBaseCode\(tokensUpper, i\);/, 'field-to-finish parser should resolve sequential directives from nearby base-code tokens instead of only adjacent pairs');
  assert.match(html, /function\s+isCurveMarkerToken\(token\s*=\s*""\)\s*\{[\s\S]*normalized === "PC" \|\| normalized === "PT";/, 'sequential directive base-code resolution should skip curve marker tokens so PT/PC can coexist with END/CLO directives');
  assert.match(html, /const\s+pointImplicitSequenceCodes\s*=\s*\[\.\.\.tokenSet\][\s\S]*\.filter\(\(token, index, arr\) => token && arr\.indexOf\(token\) === index\);/, 'sequential field-to-finish processing should keep PT/PC-tagged points in active linework sequences so arcs can rejoin adjacent tangents and closures');
  assert.match(html, /function\s+parseFieldToFinishCommands\(code\s*=\s*""\)\s*\{[\s\S]*for \(const parser of fieldToFinishCommandParsers\)/, 'LineSmith should parse point-code tokens through the command-parser registry so new directives can be added without rewriting import logic');
  assert.match(html, /const\s+fieldToFinishStandardLayerColorRules\s*=\s*\[[\s\S]*water[\s\S]*gas[\s\S]*sewer[\s\S]*power/, 'LineSmith should map common utility layer names to standard colors (water/gas/sewer/power) when creating Field-to-Finish layers');
  assert.match(html, /function\s+pickFieldToFinishLayerColor\(layerName\s*=\s*""\)\s*\{[\s\S]*Math\.floor\(Math\.random\(\) \* palette\.length\)/, 'LineSmith should assign a random high-visibility fallback color for Field-to-Finish-created layers that do not match standard utility names');
  assert.match(html, /function\s+resolveFieldToFinishLayerIdForCode\(pointCode\s*=\s*""\)\s*\{[\s\S]*const\s+layerName\s*=\s*fieldToFinishRuleState\.codeLayers\.get\(token\);[\s\S]*return\s+ensureLayerByName\(layerName\);/, 'LineSmith should resolve configured FLD code layers from parsed point-code tokens and ensure missing layers are created');
  assert.match(html, /const\s+color\s*=\s*pickFieldToFinishLayerColor\(desiredName\);[\s\S]*layers\.set\(id, sanitizeLayer\(\{ id, name: desiredName, color, lineWeight: 1\.5/, 'LineSmith should apply the Field-to-Finish layer color resolver when creating new configured layers');
  assert.match(html, /const\s+ruleLayerId\s*=\s*resolveFieldToFinishLayerIdForCode\(code\);[\s\S]*addPoint\(\{ num, x, y, z, code, notes, movable:false, layerId: ruleLayerId \|\| selectedLayerId \}\);/, 'CSV import should assign points to FLD-configured layers, creating the layer first when needed');
  assert.match(html, /function\s+buildFieldToFinishSequentialLineCommands\(\)\s*\{[\s\S]*activeSequences\s*=\s*new\s+Map\(\)/, 'LineSmith should build sequential field-to-finish line commands using tracked active code sequences');
  assert.match(html, /const\s+explicitSequentialBaseCodes\s*=\s*new\s+Set\(\);[\s\S]*explicitSequentialBaseCodes\.add\(baseCode\);/, 'LineSmith should track explicit sequential base codes so linework segments can restart implicitly after END directives');
  assert.match(html, /function\s+splitLineworkSequenceCodeToken\(token\s*=\s*""\)\s*\{[\s\S]*numericSuffix:[\s\S]*match\[2\]/, 'LineSmith should parse numbered line tokens into base-code and numeric suffix parts for sequence grouping');
  assert.match(html, /function\s+resolveLineworkSequenceKey\(token\s*=\s*"",\s*explicitSequentialBaseCodes\s*=\s*new\s+Set\(\)\)\s*\{[\s\S]*fieldToFinishRuleState\.lineworkCodes\.has\(baseCode\)[\s\S]*return\s+sequenceKey;/, 'LineSmith should allow numbered variants like FL1/FL7 when the base linework code exists in FLD rules');
  assert.match(html, /const\s+pointImplicitSequenceCodes\s*=\s*\[\.\.\.tokenSet\][\s\S]*resolveLineworkSequenceKey\(token, explicitSequentialBaseCodes\)[\s\S]*\.filter\(\(token, index, arr\) => token && arr\.indexOf\(token\) === index\);/, 'LineSmith should build implicit sequence keys from resolved linework tokens so numbered variants remain unique while PT\/PC-tagged points stay in sequence continuity');
  assert.match(html, /function\s+pointSupportsLineworkSequenceToken\(tokenSet, sequenceKey\)\s*\{[\s\S]*if \(parsed\.numericSuffix\) \{[\s\S]*return false;[\s\S]*\}[\s\S]*lineworkCompanionCodes\.get\(parsed\.baseCode\)/, 'LineSmith should keep numbered sequences isolated so FL2 shots do not continue an FL sequence while still honoring FLD companion tokens for base codes');
  assert.match(html, /Keep active sequences alive across unrelated shots so linework only[\s\S]*terminates when an explicit END\/CLO directive is encountered\./, 'LineSmith should keep active linework sequences open across unrelated point codes until END/CLO terminators are seen');
  assert.doesNotMatch(html, /for \(const baseCode of \[\.\.\.activeSequences\.keys\(\)\]\) \{[\s\S]*activeSequences\.delete\(baseCode\);[\s\S]*\}/, 'LineSmith should not break active sequences just because an intermediate point omits the active linework code');
  assert.match(html, /function\s+pointHasCurveMarker\(pointCode\s*=\s*"",\s*marker\s*=\s*"PC"\)\s*\{[\s\S]*tokensUpper\.includes\(markerUpper\)[\s\S]*const\s+isKnownLineworkToken\s*=\s*\(token\s*=\s*""\)\s*=>\s*\([\s\S]*fieldToFinishRuleState\.lineworkCodes\.has\(token\)[\s\S]*fieldToFinishRuleState\.companionToLineworkCodes\.has\(token\)[\s\S]*token\.startsWith\(markerUpper\)[\s\S]*token\.endsWith\(markerUpper\)/, 'LineSmith should detect PC/PT markers both as standalone tokens and when concatenated with known linework or companion codes');
  assert.match(html, /function\s+extractCurveLineworkCodes\(pointCode\s*=\s*""\)\s*\{[\s\S]*hasStandaloneCurveMarker\s*=\s*tokensUpper\.includes\("PC"\)\s*\|\|\s*tokensUpper\.includes\("PT"\)[\s\S]*collectCurveBaseCode\(token,\s*"PC"\);[\s\S]*collectCurveBaseCode\(token,\s*"PT"\);/, 'curve parsing should map PC/PT markers to their associated linework base codes to prevent duplicate straight segments');
  assert.match(html, /if \(action === "CLO" && active\.startPointId !== active\.lastPointId\) \{[\s\S]*lineCommands\.push\(\{ a: active\.lastPointId, b: active\.startPointId, baseCode: sequenceKey \}\);/, 'CLO directives should close sequential linework by connecting the current point back to the BEG point');
  assert.match(html, /const\s+hasGlobalEndDirective\s*=\s*tokenSet\.has\("END"\)\s*&&\s*!commands\.some\(\(cmd\)\s*=>\s*cmd\.type === "sequential-line"\);[\s\S]*if \(hasGlobalEndDirective\) activeSequences\.clear\(\);/, 'bare END directives should terminate active sequences so the next matching linework code starts a fresh segment without BEG');
  assert.match(html, /function\s+buildFieldToFinishCurveLineCommands\(\)\s*\{[\s\S]*const\s+activeCurves\s*=\s*new\s+Map\(\);[\s\S]*const\s+curveLineworkCodes\s*=\s*extractCurveLineworkCodes\(point\.code\);[\s\S]*activeCurves\.get\(baseCode\)\s*\|\|\s*null;[\s\S]*lineCommands\.push\(\{[\s\S]*a:\s*activeCurve\.startPointId,[\s\S]*b:\s*point\.id,[\s\S]*middlePointId:\s*activeCurve\.middlePointId,[\s\S]*baseCode[\s\S]*\}\);[\s\S]*activeCurves\.delete\(baseCode\);[\s\S]*activeCurves\.set\(baseCode,\s*\{\s*startPointId:\s*point\.id,\s*middlePointId:\s*null\s*\}\);/, 'LineSmith should track active PC/PT curves per linework code so closure and bridge segments remain connected between adjacent curve groups');
  assert.match(html, /const\s+explicitSequentialBaseCodes\s*=\s*new\s+Set\(\);[\s\S]*const\s+pointSequenceCandidates\s*=\s*new\s+Set\(curveLineworkCodes\);[\s\S]*resolveLineworkSequenceKey\(token, explicitSequentialBaseCodes\)[\s\S]*for \(const baseCode of activeCurves\.keys\(\)\) \{[\s\S]*pointSupportsLineworkSequenceToken\(tokenSet, baseCode\)[\s\S]*for \(const baseCode of pointSequenceCandidates\)/, 'curve command building should keep active PC/PT subsequences alive on intermediate linework points even when point codes also include BEG/END/CLO directives');
  assert.match(html, /function\s+buildCurveSuppressedSequentialLineKeys\(curveCommands\s*=\s*\[\]\)\s*\{[\s\S]*getNormalizedLineKey\(cmd\?\.a, cmd\?\.middlePointId\)[\s\S]*getNormalizedLineKey\(cmd\?\.middlePointId, cmd\?\.b\)/, 'LineSmith should suppress straight start-middle and middle-end segments when a PC/PT curve command exists');
  assert.match(html, /function\s+ensureLegacyAutoFieldToFinishLineMetadata\(\)\s*\{[\s\S]*curveSuppressedSequentialKeys\s*=\s*buildCurveSuppressedSequentialLineKeys\(curveCommands\);[\s\S]*if \(!key \|\| curveSuppressedSequentialKeys\.has\(key\)\) continue;/, 'legacy field-to-finish metadata sync should not preserve suppressed PC/PT tangent line keys');
  assert.match(html, /function\s+findDirectConnectionLine\(aId, bId\)\s*\{[\s\S]*return ln;[\s\S]*return null;[\s\S]*function\s+arePointsDirectlyConnected\(aId, bId\)\s*\{[\s\S]*return !!findDirectConnectionLine\(aId, bId\);/, 'LineSmith should reuse a direct-connection lookup helper so sync can update existing lines when needed');
  assert.match(html, /const\s+curveCommands\s*=\s*buildFieldToFinishCurveLineCommands\(\);[\s\S]*const\s+curveSuppressedSequentialKeys\s*=\s*buildCurveSuppressedSequentialLineKeys\(curveCommands\);[\s\S]*if \(key && curveSuppressedSequentialKeys\.has\(key\)\) continue;/, 'field-to-finish sync should prevent sequential lines from being created for 3-point PC/PT curve tangents');
  assert.match(html, /const\s+existingLine\s*=\s*findDirectConnectionLine\(cmd\.a, cmd\.b\);[\s\S]*if \(cmd\.type === "curve" && existingLine\.generatedBy === "field-to-finish"\)[\s\S]*const\s+nextMiddlePointId\s*=\s*Number\.isFinite\(Number\(cmd\.middlePointId\)\) \? Number\(cmd\.middlePointId\) : null;[\s\S]*prevMiddlePointId !== nextMiddlePointId[\s\S]*existingLine\.fieldToFinishCurveMiddlePointId = nextMiddlePointId;/, 'field-to-finish sync should refresh curve metadata for existing auto-lines so restored PC/PT curves render immediately');
  assert.match(html, /function\s+connectsBySequentialLinework\(aPointId, bPointId\)\s*\{[\s\S]*const\s+curveCommands\s*=\s*buildFieldToFinishCurveLineCommands\(\);[\s\S]*getNormalizedLineKey\(cmd\.a, cmd\.b\) === key/, 'manual connection logic should treat auto-generated PC/PT curve segments as already-connected field-to-finish geometry');
  assert.ok(html.includes("CIR\\s*([0-9]*\\.?[0-9]+)\\s*(?:FT)?\\b"), "field-to-finish parser should recognize CIR commands with optional spacing and FT suffixes");
  assert.match(html, /function\s+buildFieldToFinishCircleCommands\(\)\s*\{[\s\S]*if \(cmd\.type !== "circle"\) continue;[\s\S]*circles\.push\(\{ centerPointId: point\.id, radius: cmd\.radius \}\);/, 'LineSmith should derive circle draw directives from CIR point-code commands using the current point as the center');
  assert.match(html, /function\s+getCircleFromThreePoints\(start, middle, end\)\s*\{[\s\S]*determinant[\s\S]*return \{ centerX, centerY, radius \};/, 'LineSmith should solve a circle from three curve points so PC/PT curves use an arc fit instead of Bezier tangents');
  assert.match(html, /function\s+traceLinePath\(context, line, startScreen, endScreen, projectPoint = worldToScreen\)\s*\{[\s\S]*const\s+circle\s*=\s*getCircleFromThreePoints\(startWorld, middleWorld, endWorld\);[\s\S]*context\.arc\(centerScreen\.x, centerScreen\.y, radiusScreen, startAngle, endAngle, clockwise\);/, 'LineSmith should render field-to-finish curve lines as 3-point circular arcs through the PC/PT middle point');
  assert.match(html, /const\s+circleCommands\s*=\s*buildFieldToFinishCircleCommands\(\);[\s\S]*ctx\.arc\(sc\.x, sc\.y, radiusPixels, 0, Math\.PI \* 2\);/, 'LineSmith should render CIR commands as circles centered on each matching point with world-space radius scaling');
  assert.doesNotMatch(html, /ctx\.strokeStyle = "rgba\(0,0,0,0\.6\)";[\s\S]*ctx\.lineWidth = circleStrokeWidth \+ 1;/, 'CIR rendering should not add an opaque black under-stroke so map content remains visible through circles');
  assert.match(html, /ctx\.strokeStyle = colorToRgba\(layer\.color, 0\.35\) \|\| "rgba\(255,255,255,0\.35\)";/, 'CIR rendering should draw the primary circle stroke at 35% opacity for better basemap visibility');
  assert.match(html, /if \(field === "code"\) \{[\s\S]*syncFieldToFinishLinework\(\);/, 'code edits should apply field-to-finish linework synchronization immediately so BEG/END/CLO changes update linework');
  assert.match(html, /function\s+restoreState\(json,\s*\{\s*skipSync\s*=\s*false,\s*applyView\s*=\s*true\s*\}\s*=\s*\{\}\)\s*\{[\s\S]*mapGeoreference = sanitizeMapGeoreference\(s\.mapGeoreference\);[\s\S]*ensureLegacyAutoFieldToFinishLineMetadata\(\);[\s\S]*syncFieldToFinishLinework\(\);/, 'state restore should re-sync field-to-finish linework metadata so curves appear immediately after opening a drawing');
});

test('VIEWPORT.HTML includes mobile-first canvas interactions and slide-out drawer controls', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /@media \(max-width:\s*960px\)[\s\S]*\.app\.drawerOpen \.panel\{ transform:translateX\(0\); \}/, 'mobile layout should convert controls panel into a slide-out drawer');
  assert.match(html, /class="quickToolsRow quickToolsMobileRow"[\s\S]*id="drawerToggle"\s+class="drawerToggle"/, 'quick toolbar should expose a mobile controls row containing the tools drawer button');
  assert.match(html, /canvas\{[\s\S]*touch-action:none;/, 'canvas should disable native touch actions so custom pinch\/pan gestures can run');
  assert.match(html, /canvas\.addEventListener\("pointerdown"[\s\S]*touchGesture\.mode = "pinch"/, 'touch pointer down should initialize pinch mode for two-finger zoom');
  assert.match(html, /canvas\.addEventListener\("pointermove"[\s\S]*view\.scale = newScale;[\s\S]*view\.panX = center\.x - rotatedAnchor\.x \* view\.scale;[\s\S]*view\.panY = center\.y \+ rotatedAnchor\.y \* view\.scale;/, 'touch pointer move should apply pinch zoom and anchored pan updates');
  assert.match(html, /window\.setTimeout\([\s\S]*pickPoint\(mouse\.x, mouse\.y, 14\)[\s\S]*pickLine\(mouse\.x, mouse\.y, 12\)/, 'long-press should attempt selection of points or lines');
  assert.match(html, /function\s+handleCanvasPrimaryAction\(\{ additive = false, forcedPointId = null \} = \{\}\)/, 'canvas primary action logic should be reusable across mouse and touch input paths');
  assert.match(html, /function\s+handlePointerUp\(e\)\s*\{[\s\S]*const\s+shouldTreatAsTap\s*=\s*touchGesture\.mode === "pending" && !mobileInteraction\.moved;[\s\S]*if \(shouldTreatAsTap\) \{[\s\S]*handleCanvasPrimaryAction\(\);/, 'single-finger touch tap should trigger the same canvas action handler used by desktop clicks');
  assert.match(html, /if \(tool === \"addPoint\"\) \{[\s\S]*history\.push\(\"add point\"\)[\s\S]*const\s+pidNew\s*=\s*addPoint\(/, 'long-press add point mode should create a point when add-point tool is active');
  assert.match(html, /beginDrag\(\{type:"marquee", x0: mouse\.x, y0: mouse\.y, x1: mouse\.x, y1: mouse\.y, additive:false\}\);/, 'long-press on blank canvas should begin box-select marquee drag');
});


test('VIEWPORT.HTML keeps multi-point + point inspectors and map opacity always visible while tool sections are collapsible', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="panelToolsCollapse"\s+class="panelToolsCollapse"(?!\s+open)/, 'LineSmith should wrap drawer tool sections in a collapsed-by-default container');
  assert.match(html, /<summary>Tool drawer sections<\/summary>/, 'collapsible container should include a summary row to collapse/expand drawer controls');
  assert.match(html, /<div class="app panelCollapsed" id="appShell">/, 'LineSmith should initialize with the desktop controls panel collapsed by default');
  assert.match(html, /function\s+syncPanelCollapseWithSelection\(\)\s*\{[\s\S]*const\s+hasSelection\s*=\s*selectedPointIds\.length > 0 \|\| selectedLines\.length > 0;[\s\S]*setPanelCollapsed\(!hasSelection\);/, 'selection sync helper should auto-expand the desktop panel when point or line selections exist and collapse it otherwise');
  assert.match(html, /function\s+updatePointEditorFromSelection\(\)\s*\{[\s\S]*syncPanelCollapseWithSelection\(\);/, 'selection-driven editor refresh should also synchronize drawer collapse state');
  assert.match(html, /<div class="title">[\s\S]*<b>Inspector \+ Map Opacity<\/b>[\s\S]*id="mapOpacity"\s+type="range"/, 'drawer should surface map opacity in an always-visible inspector section outside the collapsible tool body');
  assert.match(html, /<div class="title">[\s\S]*<b>Inspector \+ Map Opacity<\/b>[\s\S]*id="lineInspector"\s+class="inspectorCard"/, 'always-visible inspector section should include the multi-point line inspector card');
  assert.match(html, /id="lineInspector"\s+class="inspectorCard"[\s\S]*id="pointInspector"\s+class="inspectorCard"/, 'line inspector should render above the point inspector for quick distance checks');
  assert.match(html, /id="pointInspector"\s+class="inspectorCard"/, 'point inspector card should remain rendered in the always-visible inspector section');
  assert.doesNotMatch(html, /id="panelToolsCollapse"[\s\S]*id="lineInspector"\s+class="inspectorCard"/, 'line inspector should no longer live inside the collapsible tool sections');
});


test('VIEWPORT.HTML right-click zooms to an active marquee window before cancel/clear behavior', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+zoomToScreenRect\(screenRect, options\s*=\s*\{\}\)\s*\{[\s\S]*history\.push\("zoom window"\);[\s\S]*view\.scale = newScale;/, 'LineSmith should provide a reusable zoom-to-window helper that updates view scale/pan and creates a history entry');
  assert.match(html, /canvas\.addEventListener\("contextmenu",\s*\(e\)\s*=>\s*\{[\s\S]*if \(mouse\.dragObj\?\.type === "marquee"\) \{[\s\S]*zoomToScreenRect\(windowRect\);[\s\S]*endDrag\(\);[\s\S]*return;[\s\S]*runCanvasCancelOrClearAction\(\{ trigger: "right-click" \}\);/, 'right-clicking with an active marquee should zoom to the marquee window instead of running cancel/clear selection behavior');
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
  assert.match(html, /@media \(max-width: 960px\) \{[\s\S]*\.workflowToast\{[\s\S]*bottom:8px;[\s\S]*left:8px;[\s\S]*\}/, 'mobile workflow toast should move above the bottom command toolbar to avoid blocking tool access');
  assert.match(html, /function\s+renderWorkflowToast\(\)/, 'workflow toast should render from reusable helper function');
  assert.match(html, /function\s+showWorkflowToast\(\{\s*title, message, steps, currentStepIndex\s*\}\)/, 'workflow toast should expose reusable show API for multi-step tools');
  assert.match(html, /function\s+hideWorkflowToast\(\)/, 'workflow toast should expose reusable hide API');
  assert.match(html, /function\s+getToolWorkflowToastPayload\(activeTool = tool\)/, 'workflow toast should expose reusable payload helper for toolbar tools');
  assert.match(html, /if \(activeTool === "line2pt"\) \{[\s\S]*Pick line start point[\s\S]*Pick line end point[\s\S]*currentStepIndex: hasStart \? 1 : 0/, 'line-by-2-points tool should publish stage-aware toast steps for first and second clicks');
  assert.match(html, /if \(tool === "line2pt"\) \{[\s\S]*if \(construction\.startPointId == null\) \{/, 'line-by-2-points tool should treat only null/undefined as missing start so point id 0 can still complete on the second click');
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
  assert.match(html, /window\.addEventListener\("keydown", \(e\) => \{[\s\S]*const\s+key\s*=\s*e\.key\.toLowerCase\(\);[\s\S]*if \(\(e\.ctrlKey \|\| e\.metaKey\) && !e\.altKey && key === "s"\) \{[\s\S]*saveDrawingToProject\(\);[\s\S]*return;[\s\S]*\}/, 'Ctrl+S/Cmd+S should trigger drawing save and suppress browser default save behavior');
});


test('VIEWPORT.HTML trim-to-intersect resolves trim side from click side on second selected line', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+trimGripFromClickSide\(activeSelection, hitParam\)\s*\{[\s\S]*return activeSelection\.t < hitParam \? "a" : "b";/, 'trim should derive endpoint grip from whether second-line click happened before or after the intersection along that line');
  assert.match(html, /\$\("#trimToIntersect"\)\.addEventListener\("click", \(\) => \{[\s\S]*const\s+hitT\s*=\s*pointOnLineParam\(\{x:hit\.x, y:hit\.y\}, A, B\);[\s\S]*const\s+trimGrip\s*=\s*trimGripFromClickSide\(active, hitT\);[\s\S]*active\.grip\s*=\s*trimGrip;/, 'trim command should recompute active grip using second-line click side before moving endpoint to the intersection');
  assert.match(html, /setStatus\(`Trimmed active line \(grip \$\{trimGrip\.toUpperCase\(\)\}\) to intersection at \(\$\{fmt\(hit\.x\)\}, \$\{fmt\(hit\.y\)\}\)\.`, "ok"\);/, 'trim status should report the side-derived grip endpoint that was trimmed');
});


test('VIEWPORT.HTML point inspector surfaces CP&F instrument links from selected and nearby points', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="pointInspector"\s+class="inspectorCard"/, 'selection panel should include a point inspector card');
  assert.match(html, /function\s+parseCpfInstruments\(value\s*=\s*""\)/, 'point inspector should parse CP&F instrument values from notes');
  assert.ok(html.includes('raw.replace(/^CPNFS?:\\s*/i, "")'), 'point inspector should strip CPNFS prefix from notes when parsing instrument IDs');
  assert.ok(html.includes('.split(/\\.\\.\\.|[,;|\\n]+/)'), 'point inspector should split CP&F notes on ellipses and common delimiters');
  assert.match(html, /function\s+buildCpfInstrumentUrl\(instrument\)/, 'point inspector should build CP&F PDF links from instrument IDs');
  assert.match(html, /const\s+CPNF_NEARBY_DISTANCE_FEET\s*=\s*15;/, 'point inspector should define a 15-foot nearby CPNF search radius');
  assert.match(html, /function\s+collectNearbyCpfInstruments\(point,\s*radiusFeet\s*=\s*CPNF_NEARBY_DISTANCE_FEET\)/, 'point inspector should gather CP&F instruments from selected and nearby points');
  assert.match(html, /if \(dist2\(point\.x, point\.y, candidate\.x, candidate\.y\) > radiusSquared\) continue;/, 'nearby CP&F lookup should filter points by planar distance threshold');
  assert.match(html, /const\s+cpfInstruments\s*=\s*collectNearbyCpfInstruments\(p\);/, 'point inspector should merge selected-point and nearby-point CP&F notes before rendering');
  assert.match(html, /ADA_CPF_PDF_BASE\s*=\s*"https:\/\/gisprod\.adacounty\.id\.gov\/apps\/acdscpf\/CpfPdfs\/"/, 'point inspector should use the Ada CP&F PDF base path');
  assert.match(html, /cpfLabel\.textContent\s*=\s*`CP&F \(≤\$\{CPNF_NEARBY_DISTANCE_FEET\}ft\)`/, 'point inspector should label CP&F row with nearby radius context');
  assert.match(html, /a\.textContent\s*=\s*`Open\s+\$\{instrument\}`/, 'point inspector should render quick-open CP&F links per instrument');
  assert.match(html, /function\s+parseRosNumbers\(value\s*=\s*""\)/, 'point inspector should parse ROS number references directly from notes text.');
  assert.match(html, /function\s+buildRosResourceLookup\(projectId\)/, 'point inspector should build an ROS-number lookup from EvidenceDesk project resources.');
  assert.match(html, /if \(folder\?\.key !== "ros"\) continue;/, 'ROS lookup should only include uploaded PDFs from the ROS folder.');
  assert.match(html, /const\s+matches\s*=\s*raw\.matchAll\(/, 'ROS parser should scan note text for ROS tokens so mixed note content remains supported.');
  assert.match(html, /const\s+refs\s*=\s*new\s+Set\(parseRosNumbers\(point\.notes \|\| ""\)\);/, 'ROS summary should derive references from point notes instead of a dedicated rosRefs field.');
  assert.match(html, /rosLabel\.textContent\s*=\s*"ROS refs";/, 'point inspector should render an ROS refs summary row.');
  assert.match(html, /a\.textContent\s*=\s*`Open ROS \$\{ros\.rosNumber\}`;/, 'point inspector should render quick-open links for ROS references mapped to uploaded PDFs.');
  assert.match(html, /function\s+applySelectedPointEdits\(fields,\s*sourceLabel\s*=\s*"inspector",\s*options\s*=\s*\{\}\)/, 'point inspector and point editor should share a single apply helper for point property updates');
  assert.match(html, /const\s+fieldSpecs\s*=\s*\[[\s\S]*\["Point",\s*"num",\s*p\.num\][\s\S]*\["Notes",\s*"notes",\s*p\.notes \|\| ""\]/, 'point inspector should render editable fields for number, coordinates, code, and notes');
  assert.match(html, /applyBtn\.id\s*=\s*"pointInspectorApply";/, 'point inspector should render an apply button for saving point property edits directly from inspector');
  assert.match(html, /function\s+getSelectedPoints\(\)/, 'point inspector should expose a selected-point helper for multi-edit workflows');
  assert.match(html, /function\s+summarizeSelectedPointValues\(selectedPoints,\s*keys\)/, 'point inspector should summarize shared values across selected points');
  assert.match(html, /function\s+applySharedFieldToSelectedPoints\(key,\s*rawValue,\s*sourceLabel\s*=\s*"point inspector"\)/, 'point inspector should support bulk edits from varied pills');
  assert.match(html, /function\s+applyEditsToMultiplePoints\(fields,\s*sourceLabel\s*=\s*"inspector",\s*options\s*=\s*\{\}\)\s*\{[\s\S]*if \(pointCodeChanged\) \{[\s\S]*ensureLegacyAutoFieldToFinishLineMetadata\(\);[\s\S]*syncFieldToFinishLinework\(\);[\s\S]*\}/, 'point inspector apply should re-sync field-to-finish linework when point code edits change draw commands');
  assert.match(html, /function\s+applySharedFieldToSelectedPoints\(key,\s*rawValue,\s*sourceLabel\s*=\s*"point inspector"\)\s*\{[\s\S]*if \(pointCodeChanged\) \{[\s\S]*ensureLegacyAutoFieldToFinishLineMetadata\(\);[\s\S]*syncFieldToFinishLinework\(\);[\s\S]*\}/, 'multi-point Varied code edits from inspector should re-sync field-to-finish linework immediately');
  assert.match(html, /if \(selectedPoints\.length > 1\) \{[\s\S]*buildSharedPointInspector\(selectedPoints\);/, 'point inspector should render shared multi-point values before the per-point editor');
  assert.match(html, /variedButton\.textContent\s*=\s*"Varied";/, 'point inspector should render a red Varied pill for non-shared values');
  assert.match(html, /window\.prompt\(`Set \$\{label\} for \$\{selectedPoints\.length\} selected points:`,\s*""\);/, 'clicking a Varied pill should prompt for a shared replacement value');
  assert.match(html, /pickerLabel\.textContent\s*=\s*"Inspect point";/, 'point inspector should show a point picker label when multiple points are selected');
  assert.match(html, /const\s+picker\s*=\s*document\.createElement\("select"\);/, 'point inspector should render a dropdown so a specific selected point can be inspected');
});


test('VIEWPORT.HTML supports project-linked named differential drawing saves and version restore', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="saveDrawingToProject"\s+class="ok"/, 'LineSmith should include a save-to-project action for drawings');
  assert.match(html, /id="openProjectDrawing"/, 'LineSmith should include an open-project drawing picker action in the project save section');
  assert.match(html, /id="chooseDrawingPointFile"/, 'LineSmith should include a point-file chooser action for drawing linkage');
  assert.match(html, /id="clearDrawingPointFile"/, 'LineSmith should include a clear point-file link action');
  assert.match(html, /id="drawingPointFileHint"/, 'LineSmith should display current drawing point-file link status');
  assert.match(html, /id="quickOpenDrawing"\s+class="quickToolBtn"[\s\S]*fa-folder-open/, 'LineSmith quick toolbar should expose an open-project drawing icon button');
  assert.match(html, /id="restoreDrawingVersion"/, 'LineSmith should include a restore saved version action');
  assert.match(html, /const\s+PROJECT_DRAWING_STORAGE_PREFIX\s*=\s*"surveyfoundryLineSmithDrawing"/, 'LineSmith should persist drawing history using a dedicated local storage namespace');
  assert.match(html, /function\s+diffState\(previous, next\)/, 'LineSmith should compute differential patches between saved drawing states');
  assert.match(html, /function\s+applyStateDiff\(base, diff\)/, 'LineSmith should reconstruct drawing versions from differential history');
  assert.match(html, /async\s+function\s+saveDrawingToProject\(\)/, 'LineSmith should define drawing save handler');
  assert.match(html, /async\s+function\s+listProjectDrawings\(projectId\)/, 'LineSmith should define a project drawing listing helper for open-dialog choices');
  assert.match(html, /async\s+function\s+listProjectPointFilesForDrawingLink\(projectId\)/, 'LineSmith should define a project point-file listing helper for drawing links');
  assert.match(html, /async\s+function\s+promptChooseDrawingPointFile\(\)/, 'LineSmith should define a drawing point-file picker workflow');
  assert.match(html, /function\s+setActiveDrawingPointFileLink\(link\s*=\s*null\)/, 'LineSmith should normalize and persist active drawing point-file link metadata in memory');
  assert.match(html, /async\s+function\s+promptOpenProjectDrawing\(\)/, 'LineSmith should define a drawing-open picker workflow');
  assert.ok(html.includes("const selection = window.prompt(`Open which drawing?\\n${optionList}`, '1');"), 'open drawing picker should present numbered drawing options in a prompt');
  assert.match(html, /const\s+selectedIndex\s*=\s*Number\.parseInt\(String\(selection\)\.trim\(\),\s*10\)\s*-\s*1;/, 'open drawing picker should parse selected option index from prompt input');
  assert.match(html, /if \(hasUnsavedDrawingChanges\(\)\) \{[\s\S]*window\.confirm\('You have unsaved changes in the current drawing\. Open another project drawing anyway\?'\);/, 'open drawing picker should confirm when the current drawing has unsaved edits');
  assert.match(html, /\$\("#openProjectDrawing"\)\.addEventListener\("click", \(\) => \{ void promptOpenProjectDrawing\(\); \}\);/, 'LineSmith should wire the panel open-project action to the drawing picker workflow');
  assert.match(html, /\$\("#chooseDrawingPointFile"\)\?\.addEventListener\("click", \(\) => \{ void promptChooseDrawingPointFile\(\); \}\);/, 'LineSmith should wire drawing point-file chooser button to the picker workflow');
  assert.match(html, /\$\("#quickOpenDrawing"\)\?\.addEventListener\("click", \(\) => \$\("#openProjectDrawing"\)\?\.click\(\)\);/, 'quick toolbar open icon should route to the shared project drawing picker action');
  assert.match(html, /window\.prompt\("Name this drawing before saving:",\s*"Boundary Base Map"\)/, 'save workflow should prompt for a drawing name when blank');
  assert.match(html, /if \(drawingNameInput\) drawingNameInput\.value = drawingName;/, 'save workflow should write prompted drawing name back to input');
  assert.match(html, /function\s+resolveActiveCrewUserLabel\(\)/, 'LineSmith should resolve an active crew display name for save actor metadata');
  assert.match(html, /function\s+buildPointFileActorHeaders\(\)\s*\{[\s\S]*'x-survey-app':\s*'linesmith-drawing',[\s\S]*'x-survey-user':\s*resolveActiveCrewUserLabel\(\),[\s\S]*\}/, 'LineSmith should tag drawing saves with app and active user headers for point-file actor history');
  assert.match(html, /headers:\s*\{\s*'Content-Type':\s*'application\/json',\s*\.\.\.buildPointFileActorHeaders\(\)\s*\}/, 'drawing save API calls should send actor headers for linked point-file version tracking');
  assert.match(html, /body:\s*JSON\.stringify\(\{ drawingId, drawingName, drawingState: currentState, pointFileLink: activeDrawingPointFileLink \|\| null \}\)/, 'drawing save payload should include selected point-file link metadata');
  assert.match(html, /versions\.push\(\{[\s\S]*diffFromPrevious:/, 'subsequent saves should append differential revisions');
  assert.match(html, /function\s+promptRestoreDrawingVersion\(\)/, 'LineSmith should expose saved version restore workflow');
  assert.ok(html.includes('.join("\\n")'), 'restore workflow should join version choices with escaped newline separators');
  assert.match(html, /tryImportProjectBrowserDrawingPayload\(\)/, 'LineSmith should support opening saved drawing payloads launched from Project Browser');
  assert.match(html, /mapGeoreference:\s*mapGeoreference\s*\?\s*\{/, 'saved drawing snapshots should persist georeference transform data');
  assert.match(html, /function\s+sanitizeMapGeoreference\(candidate\)/, 'LineSmith should centralize georeference validation for restores and history fallback');
  assert.match(html, /mapGeoreference\s*=\s*sanitizeMapGeoreference\(s\.mapGeoreference\);/, 'restored drawing snapshots should hydrate georeference transform data through sanitization');
  assert.match(html, /record\.latestMapGeoreference\s*=\s*sanitizeMapGeoreference\(currentState\.mapGeoreference\);/, 'saving should persist a latest georeference fallback alongside differential versions');
  assert.match(html, /setStatus\(`Saved drawing "\$\{drawingName\}" to project history \(\$\{record\.versions\.length\} version\$\{record\.versions\.length === 1 \? "" : "s"\}\)\.`, "ok"\);[\s\S]*triggerQuickSaveSuccessPulse\(\);/, 'successful drawing saves should pulse the quick save icon to confirm persistence');
  assert.match(html, /function\s+triggerQuickSaveSuccessPulse\(\)\s*\{[\s\S]*quickSaveBtn\.classList\.remove\("saveSuccessPulse"\);[\s\S]*void quickSaveBtn\.offsetWidth;[\s\S]*quickSaveBtn\.classList\.add\("saveSuccessPulse"\);/, 'save pulse helper should restart the icon animation even for repeated rapid saves');
  assert.match(html, /const\s+fallbackGeoreference\s*=\s*sanitizeMapGeoreference\(record\.latestMapGeoreference\);[\s\S]*state\.mapGeoreference\s*=\s*fallbackGeoreference;/, 'version materialization should restore latest georeference when differential history omitted that field');
  assert.match(html, /latestMapGeoreference,/, 'project browser metadata should carry the latest georeference snapshot');
  assert.match(html, /latestSavedAt:\s*new Date\(\)\.toISOString\(\),/, 'project browser metadata should carry the latest drawing save timestamp');
  assert.match(html, /drawingsFolder\.index\.sort\(\(a, b\) => \{[\s\S]*latestSavedAt[\s\S]*return bValue - aValue;[\s\S]*\}\);/, 'project drawing resources should be sorted by latest saved timestamp descending');
  assert.match(html, /drawingsFolder\.index\s*=\s*drawingsFolder\.index\.filter\(\(entry\) => entry && typeof entry === "object"\);/, 'project drawing metadata save should ignore malformed drawing index entries before accessing entry ids');
  assert.match(html, /if \(mapLayerState\.enabled\) syncMapToView\(true\);/, 'restoring a drawing should resync map view after georeference hydration');
  assert.match(html, /for \(const p of \(s\.points \|\| \[\]\)\) \{[\s\S]*if \(!p \|\| typeof p !== "object" \|\| p\.id == null\) continue;[\s\S]*points\.set\(p\.id, \{ \.\.\.p, movable: isMovable\(p\.movable\), layerId: String\(p\.layerId \|\| selectedLayerId \|\| DEFAULT_LAYER_ID\) \}\);[\s\S]*\}/, 'restoreState should skip malformed point entries and normalize movable/layer metadata');
  assert.match(html, /for \(const l of \(s\.lines \|\| \[\]\)\) \{[\s\S]*if \(!l \|\| typeof l !== "object" \|\| l\.id == null \|\| l\.a == null \|\| l\.b == null\) continue;[\s\S]*lines\.set\(l\.id, \{ \.\.\.l, movable: isMovable\(l\.movable\), layerId: String\(l\.layerId \|\| selectedLayerId \|\| DEFAULT_LAYER_ID\) \}\);[\s\S]*\}/, 'restoreState should skip malformed line entries and normalize movable/layer metadata');
  assert.match(html, /for \(const point of points\.values\(\)\) \{[\s\S]*if \(layers\.has\(point\.layerId\)\) continue;[\s\S]*const\s+ruleLayerId\s*=\s*resolveFieldToFinishLayerIdForCode\(point\.code \|\| ""\);[\s\S]*point\.layerId\s*=\s*\(ruleLayerId && layers\.has\(ruleLayerId\)\)[\s\S]*selectedLayerId \|\| DEFAULT_LAYER_ID\);[\s\S]*\}/, 'restoreState should reapply field-to-finish layer mapping for restored points that lost or reference missing layers');
  assert.match(html, /selectedPointIds = Array\.isArray\(s\.selection\?\.selectedPointIds\)[\s\S]*filter\(\(id\) => points\.has\(id\)\)/, 'restoreState should drop stale selected point ids that are not present in restored points');
  assert.match(html, /selectedLines = Array\.isArray\(s\.selection\?\.selectedLines\)[\s\S]*filter\(\(entry\) => entry\?\.id != null && lines\.has\(entry\.id\)\)/, 'restoreState should drop stale selected lines that are not present in restored lines');
  assert.match(html, /let\s+lastSavedDrawingSnapshot\s*=\s*"";/, 'LineSmith should track a saved-state snapshot for unsaved-change prompts');
  assert.match(html, /function\s+markDrawingAsSaved\(\)/, 'LineSmith should expose helper to refresh saved snapshot baseline');
  assert.match(html, /function\s+hasUnsavedDrawingChanges\(\)/, 'LineSmith should expose helper to compare current state against last saved snapshot');
  assert.match(html, /window\.addEventListener\("message",\s*async\s*\(event\) => \{[\s\S]*survey-cad:request-unsaved-state[\s\S]*hasUnsavedChanges: hasUnsavedDrawingChanges\(\)/, 'LineSmith should reply to launcher unsaved-state checks');
  assert.match(html, /survey-cad:request-save-before-navigate:response/, 'LineSmith should respond to launcher save-before-leave requests');
  assert.match(html, /saved = await saveDrawingToProject\(\);/, 'LineSmith should attempt project save when launcher requests save-before-navigation');
  assert.match(html, /async\s+function\s+saveDrawingToProject\(\)\s*\{[\s\S]*return false;[\s\S]*markDrawingAsSaved\(\);[\s\S]*return true;/, 'save workflow should return explicit success status and refresh saved snapshot baseline');
  assert.match(html, /requestAnimationFrame\(draw\);[\s\S]*markDrawingAsSaved\(\);/, 'boot should initialize unsaved-change baseline before new edits occur');
});


test('VIEWPORT.HTML restores the last project drawing when launched directly with an active project', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+PROJECT_LAST_DRAWING_STORAGE_PREFIX\s*=\s*"surveyfoundryLastLineSmithDrawing"/, 'LineSmith should define a stable storage namespace for the last-opened project drawing');
  assert.match(html, /function\s+saveLastOpenedProjectDrawing\(projectId, storageKey\)/, 'LineSmith should persist the last-opened drawing key by project');
  assert.match(html, /saveLastOpenedProjectDrawing\(activeProjectId, storageKey\);/, 'LineSmith should update last-opened drawing state when a project drawing is saved or opened');
  assert.match(html, /async\s+function\s+tryRestoreLastOpenedProjectDrawing\(\)/, 'LineSmith should define a direct-launch restore helper for last-opened drawings');
  assert.match(html, /if \(queryParams\.get\("source"\)\) return false;/, 'LineSmith should only restore last-opened drawings for direct launches without source');
  assert.match(html, /const\s+restoredLastDrawing\s*=\s*await\s+tryRestoreLastOpenedProjectDrawing\(\);[\s\S]*if \(restoredLastDrawing\) \{[\s\S]*connectCollaboration\(\);[\s\S]*return;[\s\S]*\}/, 'LineSmith boot should restore last-opened drawing and then connect collaboration before showing default ready state');
});

test('VIEWPORT.HTML keeps PointForge imports from being overwritten by prior collaboration room state', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+launchSource\s*=\s*queryParams\.get\("source"\)\s*\|\|\s*"";/, 'LineSmith should cache launch source for import-aware boot decisions');
  assert.match(html, /function\s+connectCollaboration\(\{\s*skipInitialStateHydration\s*=\s*false,\s*syncLocalStateOnConnect\s*=\s*false\s*\}\s*=\s*\{\}\)\s*\{/, 'collaboration boot should accept options for initial-state hydration and local-state push');
  assert.match(html, /if \(message\.state && !skipInitialStateHydration\) \{[\s\S]*restoreState\(message\.state, \{ skipSync: true, applyView: false \}\);/, 'PointForge imports should be able to skip applying stale welcome state from collaboration room');
  assert.match(html, /if \(syncLocalStateOnConnect\) \{[\s\S]*const\s+connectState\s*=\s*serializeState\(\{ includeView: false \}\);[\s\S]*if \(!shouldSkipQueuedCollabState\(connectState\)\) \{[\s\S]*collab\.pendingState = connectState;[\s\S]*flushCollabStateSync\(\);/, 'PointForge imports should publish freshly imported geometry once collaboration connects');
  assert.match(html, /reconnectDelayMs:\s*3000,\s*maxReconnectDelayMs:\s*60000,\s*reconnectTimer:\s*null,\s*connectToken:\s*0/, 'collaboration state should track reconnect timing and active connection generation');
  assert.match(html, /function\s+shouldSkipQueuedCollabState\(statePayload\)\s*\{[\s\S]*statePayload === collab\.latestServerState[\s\S]*statePayload === collab\.stateInFlight\.localState[\s\S]*\}/, 'collaboration sync should skip enqueueing duplicate/local-server-equivalent payloads to prevent socket state cascades');
  assert.match(html, /socket\.addEventListener\("close",\s*\(\)\s*=>\s*\{[\s\S]*setCollabStatus\(`reconnecting \(\$\{roomId\}\)…`\);[\s\S]*const\s+scheduledDelayMs\s*=\s*collab\.reconnectDelayMs;[\s\S]*collab\.reconnectTimer\s*=\s*setTimeout\(\(\) => \{[\s\S]*connectCollaboration\(\{ skipInitialStateHydration, syncLocalStateOnConnect \}\);[\s\S]*\},\s*scheduledDelayMs\);[\s\S]*collab\.reconnectDelayMs\s*=\s*nextCollabReconnectDelay\(scheduledDelayMs, collab\.maxReconnectDelayMs\);/, 'LineSmith should automatically retry websocket collaboration after disconnects with exponential backoff');
  assert.match(html, /const\s+importedFromPointforge\s*=\s*tryImportPointforgePayload\(\);[\s\S]*if \(importedFromPointforge\) \{[\s\S]*connectCollaboration\(\{ skipInitialStateHydration: true, syncLocalStateOnConnect: true \}\);[\s\S]*return;[\s\S]*\}/, 'boot should connect collaboration after PointForge import using import-safe options');
});

test('VIEWPORT.HTML syncs collaboration state during live drag and mobile touch cursor movement', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /canvas\.addEventListener\("pointermove", \(e\) => \{[\s\S]*broadcastCursor\(\);/, 'touch pointer movement should broadcast remote cursor updates for mobile users');
  assert.match(html, /if \(mouse\.dragObj\?\.type === "point"\) \{[\s\S]*scheduleCollabStateSync\(\);[\s\S]*schedulePointsTableRender\(\);/, 'point drag should debounce-send collaboration state updates while dragging');
  assert.match(html, /if \(mouse\.dragObj\?\.type === "line"\) \{[\s\S]*scheduleCollabStateSync\(\);[\s\S]*schedulePointsTableRender\(\);/, 'line drag should debounce-send collaboration state updates while dragging');
  assert.match(html, /if \(mouse\.dragObj && mouse\.dragObj\.type !== "pan"\) \{[\s\S]*if \(!mouse\.dragObj\._moved\) \{[\s\S]*\} else \{[\s\S]*scheduleCollabStateSync\(\);/, 'drag commit should force a final collaboration state sync after movement');

  assert.match(html, /sendCollabMessage\(\{[\s\S]*type: "state",[\s\S]*baseRevision: collab\.lastKnownRevision,[\s\S]*state: statePayload,[\s\S]*\}\);/, 'collaboration state sync should include base revision and state payload for optimistic concurrency');
  assert.match(html, /const\s+statePayload\s*=\s*collab\.pendingState;[\s\S]*if \(statePayload === collab\.latestServerState\) \{[\s\S]*return;[\s\S]*\}/, 'flush should drop queued payloads that already match latest server state to avoid repeat-send loops');
  assert.match(html, /if \(message\.type === "state" && message\.state\) \{[\s\S]*restoreState\(message\.state, \{ skipSync: true, applyView: false \}\);/, 'remote collaboration state restores should not overwrite local user view pan/zoom');
  assert.match(html, /if \(message\.type === "state-rejected"\) \{[\s\S]*const\s+localDiff\s*=\s*diffState\(baseObj, localObj\);[\s\S]*applyStateDiff\(serverObj, localDiff\);/, 'LineSmith should rebase unsent local edits on top of canonical server state when revisions conflict');
});



test('VIEWPORT.HTML defers drag lock release until queued collaboration state sync is flushed', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /pendingDragLockRelease\s*:\s*null/, 'collaboration state should track pending drag lock release while state sync is in-flight');
  assert.match(html, /function\s+flushPendingDragLockRelease\(\)\s*\{[\s\S]*if \(collab\.stateDebounce \|\| collab\.pendingState \|\| collab\.stateInFlight\) return;[\s\S]*sendLockRelease\(pendingLock\);/, 'drag lock release helper should wait until no queued/in-flight state sync remains before releasing lock');
  assert.match(html, /function\s+endDrag\(\)\s*\{[\s\S]*if \(collab\.activeDragLock\) \{[\s\S]*if \(collab\.enabled && collab\.socket\?\.readyState === WebSocket\.OPEN[\s\S]*collab\.pendingDragLockRelease = activeLock;[\s\S]*flushPendingDragLockRelease\(\);[\s\S]*\} else \{[\s\S]*sendLockRelease\(activeLock\);/, 'endDrag should defer lock release while drag state sync is queued so other clients cannot acquire stale point/line edits before final state publishes');
  assert.match(html, /if \(message\.type === "state-ack"\) \{[\s\S]*flushCollabStateSync\(\);[\s\S]*flushPendingDragLockRelease\(\);/, 'state acknowledgements should flush any deferred drag lock release after queued state sync processing');
});

test('VIEWPORT.HTML collaboration includes object lock handshake and lock flash visuals', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /type:\s*'lock-request'/, 'LineSmith should request a collaboration lock before dragging editable objects');
  assert.match(html, /if \(message\.type === "lock-granted"\)/, 'LineSmith should handle lock-granted responses');
  assert.match(html, /if \(message\.type === "lock-denied"\)/, 'LineSmith should handle lock-denied responses');
  assert.match(html, /if \(message\.type === "lock-updated"\)/, 'LineSmith should apply lock updates from other collaborators');
  assert.match(html, /@keyframes lockDeniedFlash/, 'LineSmith should define red\/blue flash animation for lock denials');
  assert.match(html, /const\s+lockVisualState\s*=\s*buildLockVisualState\(\);/, 'draw loop should compute lock visual state each frame');
  assert.match(html, /isCollabLockedLine\s*=\s*lockVisualState\.lockedLineIds\.has\(ln\.id\)/, 'locked lines should flash in the canvas renderer');
  assert.match(html, /isCollabLockedPoint\s*=\s*lockVisualState\.lockedPointIds\.has\(p\.id\)/, 'locked points should flash in the canvas renderer');
});

test('VIEWPORT.HTML renders ArrowHead collaborator position on map and canvas with directional cone', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /if \(message\.type === "ar-presence" && message\.presence\) \{[\s\S]*upsertMapArPresence\(message\.clientId, presence\);/, 'LineSmith should ingest ArrowHead presence updates from collaboration websocket messages');
  assert.match(html, /const\s+cone\s*=\s*L\.polygon\(\[\],/, 'LineSmith map should create a polygon cone graphic for ArrowHead viewing direction');
  assert.match(html, /entry\.cone\.setLatLngs\(\[\[presence\.lat, presence\.lon\], \[leftLat, leftLon\], \[rightLat, rightLon\]\]\);/, 'LineSmith should update triangle cone geometry to visualize ArrowHead heading on map');
  assert.match(html, /for \(const \[clientId, presence\] of collab\.remoteArPresence\.entries\(\)\) \{[\s\S]*const\s+sp\s*=\s*worldToScreen\(x, y\);[\s\S]*ctx\.beginPath\(\);[\s\S]*ctx\.arc\(sp\.x, sp\.y, 4, 0, Math\.PI \* 2\);/, 'LineSmith should draw ArrowHead collaborator markers on the LineSmith canvas even when map tiles are hidden');
});

test('VIEWPORT.HTML provides ArrowHead AR launch handoff with LineSmith geometry payload', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+ARROWHEAD_IMPORT_STORAGE_KEY\s*=\s*"lineSmithArrowHeadImport"/, 'LineSmith should define a stable localStorage key for ArrowHead handoff payloads');
  assert.match(html, /id="openArrowHead"[^>]*>Open ArrowHead AR<\/button>/, 'LineSmith UI should provide an Open ArrowHead AR action');
  assert.match(html, /function\s+buildArrowHeadPayload\(\)/, 'LineSmith should build a payload containing points, lines, and georeference data');
  assert.match(html, /function\s+ensureArrowHeadLaunchDrawing\(\)/, 'LineSmith should resolve a launch drawing before opening ArrowHead');
  assert.match(html, /if \(activeProjectId\) \{[\s\S]*loadLastOpenedProjectDrawing\(activeProjectId\)/, 'LineSmith should try opening the project last-opened drawing before launching ArrowHead');
  assert.match(html, /return\s+isCollabSocketConnected\(\);/, 'LineSmith should allow ArrowHead launch when collaboration socket is connected as another live viewport');
  assert.match(html, /collabRoomId:\s*resolveCollabRoomId\(\)/, 'LineSmith should include the collaboration room in ArrowHead handoff payload so both apps join the same websocket room');
  assert.match(html, /localStorage\.setItem\(ARROWHEAD_IMPORT_STORAGE_KEY,\s*payloadJson\)/, 'LineSmith should persist ArrowHead handoff payload before navigation');
  assert.match(html, /const\s+targetPath\s*=\s*`\/ArrowHead\.html\?\$\{targetParams\.toString\(\)\}`;/, 'LineSmith should launch ArrowHead with launcher-aware query parameters');
  assert.match(html, /window\.parent\.postMessage\(\{[\s\S]*type:\s*"survey-cad:navigate-app",[\s\S]*path:\s*targetPath/, 'LineSmith should use launcher postMessage navigation when embedded');
});


test('VIEWPORT.HTML continuously syncs ArrowHead handoff payload while LineSmith geometry changes', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+ARROWHEAD_SYNC_INTERVAL_MS\s*=\s*1000;/, 'LineSmith should throttle ArrowHead payload sync frequency while drawing');
  assert.match(html, /function\s+syncArrowHeadPayloadToStorage\(options\s*=\s*\{\}\)/, 'LineSmith should expose a helper to sync current points\/lines to ArrowHead storage');
  assert.match(html, /syncArrowHeadPayloadToStorage\(\{\s*force:\s*true\s*\}\);/, 'opening ArrowHead should force-sync the latest geometry before navigation');
  assert.match(html, /updateUndoRedoHUD\(\);[\s\S]*syncArrowHeadPayloadToStorage\(\);[\s\S]*requestAnimationFrame\(draw\);/, 'draw loop should keep syncing ArrowHead payload so point\/line edits appear in AR without reopening');
});



test('VIEWPORT.HTML point manager cell edits schedule collaboration sync for each committed field update', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+onPointCellInput\(e\)\s*\{[\s\S]*if \(!raw \|\| pointNumberExists\(raw, p\.id\)\) \{ inp\.classList\.add\("bad"\); return; \}[\s\S]*p\.num = raw;[\s\S]*scheduleCollabStateSync\(\);[\s\S]*return;/, 'point manager number edits should sync collaboration state after valid commits so remote clients update point labels/codes immediately');
  assert.match(html, /if \(field === "x" \|\| field === "y" \|\| field === "z"\) \{[\s\S]*if \(!Number\.isFinite\(val\)\) \{ inp\.classList\.add\("bad"\); return; \}[\s\S]*p\[field\] = val;[\s\S]*scheduleCollabStateSync\(\);[\s\S]*return;/, 'point manager coordinate edits should sync collaboration state after valid numeric changes');
  assert.match(html, /if \(field === "code" \|\| field === "notes"\) \{[\s\S]*if \(field === "code"\) setPointCode\(p, String\(inp\.value\)\);[\s\S]*scheduleCollabStateSync\(\);[\s\S]*return;/, 'point manager code/notes edits should sync collaboration state after each committed change, including normalized code edits');
});
test('VIEWPORT.HTML point editor code updates auto-connect new JPN targets', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+connectJpnReferencedPointsForSource\(_sourcePointId\)\s*\{/, 'LineSmith should keep a source-point JPN connector helper for editor updates');
  assert.match(html, /if \(field === "code"\) \{[\s\S]*ensureLegacyAutoFieldToFinishLineMetadata\(\);[\s\S]*syncFieldToFinishLinework\(\);/, 'editing point code in the point editor should re-sync auto-generated field-to-finish linework and clean stale lines');
  assert.match(html, /if \(field === "code"\) \{[\s\S]*syncFieldToFinishLinework\(\);[\s\S]*setStatus\(`Auto-updated linework for point \$\{p\.num\}: \+\$\{addedJpn\} JPN, \+\$\{addedSequential\} sequential, \+\$\{addedCurve\} curve, -\$\{removed\} removed\.`, "ok"\);/, 'code-edit linework updates should run in-place and avoid forced table rerender calls that break typing focus');
  assert.match(html, /Auto-updated linework for point \$\{p\.num\}: \+\$\{addedJpn\} JPN, \+\$\{addedSequential\} sequential, \+\$\{addedCurve\} curve, -\$\{removed\} removed\./, 'LineSmith should report add/remove totals when code edits re-sync field-to-finish linework');
});

test('VIEWPORT.HTML point inspector apply paths explicitly schedule collaboration sync after committing edits', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+applyEditsToMultiplePoints\(fields,\s*sourceLabel\s*=\s*"inspector",\s*options\s*=\s*\{\}\)\s*\{[\s\S]*function\s+commitEdits\(\)\s*\{[\s\S]*setPointCode\(point, String\(values\.code \?\? point\.code\)\)[\s\S]*scheduleCollabStateSync\(\);[\s\S]*schedulePointsTableRender\(\);/, 'point inspector apply edits should schedule collab sync immediately after committing point updates');
  assert.match(html, /function\s+applyPendingPrimaryPointEditorEdits\(sourceLabel\s*=\s*"point editor"\)\s*\{[\s\S]*setPointCode\(point, String\(\$\("#ptCode"\)\?\.value \?\? point\.code\)\)[\s\S]*scheduleCollabStateSync\(\);[\s\S]*schedulePointsTableRender\(\);/, 'primary inspector/save pending edits should schedule collab sync after committing the edited point');
  assert.match(html, /function\s+applySharedFieldToSelectedPoints\(key, rawValue, sourceLabel\s*=\s*"point inspector"\)\s*\{[\s\S]*history\.push\(selectedPoints\.length === 1 \? "edit point" : "edit points"\);[\s\S]*scheduleCollabStateSync\(\);[\s\S]*schedulePointsTableRender\(\);/, 'shared inspector field apply should schedule collab sync so bulk inspector updates propagate to connected clients');
});

test('VIEWPORT.HTML save applies pending primary point editor edits before snapshotting project history', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+hasPendingPrimaryPointEditorEdits\(point\)\s*\{[\s\S]*normalizePointCode\(String\(\$\("#ptCode"\)\?\.value/, 'save workflow should detect pending primary point-editor values including normalized point-code changes before snapshotting');
  assert.match(html, /function\s+applyPendingPrimaryPointEditorEdits\(sourceLabel\s*=\s*"point editor"\)\s*\{[\s\S]*const\s+point\s*=\s*selectedPointId\s*\?\s*points\.get\(selectedPointId\)\s*:\s*null;[\s\S]*history\.push\("edit point"\);[\s\S]*syncFieldToFinishLinework\(\);/, 'save-triggered primary point editor apply should commit through history and linework sync so collaboration receives code updates');
  assert.match(html, /function\s+saveDrawingToProject\(\)\s*\{[\s\S]*const\s+appliedPendingEdits\s*=\s*applyPendingPrimaryPointEditorEdits\("point editor save"\);[\s\S]*if \(!appliedPendingEdits\) return false;/, 'saving should always commit pending primary point-editor field values before writing project history');
});




test('VIEWPORT.HTML allows save-triggered point editor apply to bypass async single-point collab lock handshake', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+applyEditsToMultiplePoints\(fields,\s*sourceLabel\s*=\s*"inspector",\s*options\s*=\s*\{\}\)\s*\{[\s\S]*const\s+\{\s*lockDuringSinglePointCollabEdit\s*=\s*true\s*\}\s*=\s*options;/, 'apply helper should support disabling async single-point lock handshake when callers need immediate local commit');
  assert.match(html, /if \(lockDuringSinglePointCollabEdit && editsByPoint\.length === 1 && collab\.enabled && collab\.socket\?\.readyState === WebSocket\.OPEN\) \{/, 'single-point collaboration lock request path should be conditional so save workflow can force immediate local commit');
});

test('VIEWPORT.HTML normalizes point code token ordering and deduplicates linework directives', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+normalizePointCode\(rawCode = ""\)\s*\{[\s\S]*directivePriority\s*=\s*new\s+Map\(\[\["END",\s*0\],\s*\["BEG",\s*1\],\s*\["CLO",\s*2\]\]\)/, 'point-code normalization should prioritize END before BEG/CLO when duplicate sequential directives are present for the same base code');
  assert.match(html, /for \(const target of parsedJpnTargets\) pushUnique\(`JPN\$\{target\}`\);[\s\S]*for \(const token of passthroughTokens\) pushUnique\(token\);/, 'point-code normalization should keep JPN directives ahead of unknown passthrough tokens like ad-hoc utility IDs');
  assert.match(html, /function\s+appendTokensToPointCode\(pointId, tokens = \[\]\)\s*\{[\s\S]*return\s+setPointCode\(point, joinCodeTokens\(\[\.\.\.currentTokens, \.\.\.tokens\]\)\);/, 'line-edit token appends should flow through point-code normalization so duplicates are removed and ordering stays consistent');
  assert.match(html, /if \(field === "code"\) setPointCode\(p, String\(inp\.value\)\);/, 'point editor code typing should normalize BEG\/END\/JPN token layout immediately on edit');
  assert.match(html, /if \(nextUpper && directives\.has\(nextUpper\) && !directives\.has\(tokenUpper\)\) \{[\s\S]*if \(isCurveMarkerToken\(tokenUpper\)\) \{[\s\S]*directiveBaseCode = resolveSequentialDirectiveBaseCode\(tokensUpper, i \+ 1\) \|\| "";[\s\S]*if \(!directiveBaseCode \|\| isCurveMarkerToken\(directiveBaseCode\)\) continue;/, 'point-code normalization should resolve CLO\/END directives after PT\/PC markers back to the adjacent linework base code');
});



test('VIEWPORT.HTML filters applied field-to-finish tokens from rendered point labels', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+getRenderedPointCode\(rawCode = ""\)\s*\{[\s\S]*if \(i === 0\) \{[\s\S]*directives\.has\(tokenUpper\)[\s\S]*\/\^JPN\[A-Z0-9\]\+\$\/i\.test\(tokenRaw\)[\s\S]*fieldToFinishRuleState\.lineworkCodes\.has\(tokenUpper\)/, 'LineSmith should keep the first code token while filtering applied directives, JPN commands, and linework tokens from displayed labels');
  assert.match(html, /const\s+codeText\s*=\s*getRenderedPointCode\(p\.code\);/, 'point label rendering should use filtered code text rather than raw point codes');
});



test('VIEWPORT.HTML persists manual line connections in point codes and removes directives when deleting', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+applyManualConnectionCode\(pointAId, pointBId\)\s*\{[\s\S]*if \(connectsBySequentialLinework\(pointAId, pointBId\)\) return "sequential";[\s\S]*appendTokensToPointCode\(source\.id, \[`JPN\$\{targetNum\}`\]\);/, 'manual line creation should add JPN directives when the pair is not already covered by sequential linework');
  assert.match(html, /function\s+addManualLine\(aPointId, bPointId, movable=false, layerId = selectedLayerId\)\s*\{[\s\S]*const\s+codeType\s*=\s*applyManualConnectionCode\(aPointId, bPointId\);/, 'manual line creation should funnel through a helper that synchronizes point code directives');
  assert.match(html, /function\s+deleteLine\(lid\)\s*\{[\s\S]*removeJpnDirectiveFromPointCode\(aPoint\.id, bPoint\.num\);[\s\S]*removeJpnDirectiveFromPointCode\(bPoint\.id, aPoint\.num\);[\s\S]*ensureSequentialBreakForPair\(aPoint\.id, bPoint\.id\);[\s\S]*if \(codeChanged\) syncFieldToFinishLinework\(\);/, 'deleting a line should remove JPN links first, or insert sequential END/BEG breaks so the removed connection does not immediately reappear');
  assert.match(html, /const\s+lid\s*=\s*addManualLine\(aId, bId, false\);/, 'LINE command should route line creation through the manual-connection code synchronizer');
  assert.match(html, /const\s+lid\s*=\s*addManualLine\(construction\.startPointId, endId, false\);/, 'Line 2-point tool should route line creation through the manual-connection code synchronizer');
});
test('VIEWPORT.HTML adds layer model, toolbar controls, and layer manager modal for drawing rules', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /const\s+DEFAULT_LAYER_ID\s*=\s*"layer-1";/, 'LineSmith should define a default layer id for new drawings');
  assert.match(html, /const\s+layers\s*=\s*new\s+Map\(\);\s*\/\/ id -> \{id,name,color,locked,visible,lineWeight,fill\}/, 'LineSmith should maintain a first-class layer registry');
  assert.match(html, /id="quickLayerDropdown"[\s\S]*id="quickLayerDropdownButton"[\s\S]*id="quickLayerDropdownMenu"/, 'quick toolbar should expose an HTML layer dropdown for active drawing layer');
  assert.match(html, /id="quickPointGroupDropdown"[\s\S]*id="quickPointGroupDropdownButton"[\s\S]*id="quickPointGroupDropdownMenu"/, 'quick toolbar should expose a point-group dropdown beside the layer picker');
  assert.match(html, /id="quickLayerManager"[\s\S]*fa-layer-group/, 'quick toolbar should include a layer-manager icon button');
  assert.match(html, /id="layersModal"\s+class="modalOverlay hidden"/, 'LineSmith should define a layer manager modal');
  assert.match(html, /<th>Name<\/th>[\s\S]*<th>Color<\/th>[\s\S]*<th>Line Weight<\/th>[\s\S]*<th>Lock<\/th>[\s\S]*<th>Visible<\/th>[\s\S]*<th>Fill<\/th>/, 'layer manager table should provide editable layer fields and flags');
  assert.match(html, /function\s+addPoint\(\{num, x, y, z=0, code="", notes="", movable=false, layerId = selectedLayerId\}\)/, 'new points should default to the currently selected layer');
  assert.match(html, /function\s+addLine\(aPointId, bPointId, movable=false, layerId = selectedLayerId, options = \{\}\)/, 'new lines should default to the currently selected layer while allowing optional curve metadata');
  assert.match(html, /if \(!isLayerVisible\(p\.layerId\)\) continue;/, 'rendering should hide point symbols for invisible layers');
  assert.match(html, /if \(!isLayerVisible\(ln\.layerId\)\) continue;/, 'rendering and selection should hide linework for invisible layers');
  assert.match(html, /function\s+setQuickLayerDropdownOpen\(open\)\s*\{[\s\S]*quickLayerDropdownMenu\.classList\.toggle\("hidden", !quickLayerDropdownOpen\);/, 'quick toolbar should drive an HTML dropdown open state instead of relying on native select widgets');
  assert.match(html, /function\s+setQuickPointGroupDropdownOpen\(open\)\s*\{[\s\S]*quickPointGroupDropdownMenu\.classList\.toggle\("hidden", !quickPointGroupDropdownOpen\);/, 'point-group toolbar control should also manage an explicit HTML dropdown open state');
  assert.match(html, /function\s+buildQuickPointGroups\(\)\s*\{[\s\S]*const\s+includeAllLayers\s*=\s*selectedLayerId === DEFAULT_LAYER_ID;[\s\S]*if \(!includeAllLayers && point\.layerId !== selectedLayerId\) continue;/, 'point-group dropdown should list all groups on Default layer and only active-layer groups otherwise');
  assert.match(html, /function\s+selectQuickPointGroup\(group\)\s*\{[\s\S]*selectedPointIds\s*=\s*group\.pointIds\.filter\(\(pointId\) => points\.has\(pointId\)\);/, 'picking a point group from the toolbar should select all points in that group');
  assert.match(html, /function\s+getSelectionLayerDisplayState\(\)\s*\{[\s\S]*label:\s*"Multiple Layers"/, 'LineSmith should compute layer toolbar state from current selection and surface a Multiple Layers label for mixed-layer selections');
  assert.match(html, /const\s+layerDisplayState\s*=\s*getSelectionLayerDisplayState\(\);[\s\S]*const\s+toolbarLayerId\s*=\s*layerDisplayState\.mode === "single" \? layerDisplayState\.layerId : selectedLayerId;/, 'layer toolbar should temporarily reflect the selected entity layer without overwriting the drawing layer choice');
  assert.match(html, /const\s+toggles\s*=\s*\[[\s\S]*key:\s*"locked"[\s\S]*key:\s*"visible"[\s\S]*key:\s*"fill"/, 'each dropdown layer row should expose lock, visibility, and fill toggle controls');
  assert.match(html, /btn\.addEventListener\("click", \(event\) => \{[\s\S]*event\.stopPropagation\(\);[\s\S]*toggleLayerFlag\(layer, toggle\.key\);[\s\S]*setQuickLayerDropdownOpen\(true\);/, 'toggling layer flags from the dropdown should not select the row and should keep the dropdown open');
  assert.match(html, /\.quickLayerDropdownMenu\{[\s\S]*max-height:320px;[\s\S]*overflow-y:auto;/, 'layer dropdown should become scrollable after roughly ten rows');
  assert.match(html, /ctx\.strokeStyle = isMovable\(ln\.movable\) \? "#800000" : layer\.color;[\s\S]*ctx\.lineWidth = Math\.max\(0\.5, layer\.lineWeight\);/, 'line rendering should use per-layer color and lineweight');
  assert.match(html, /if \(!layer\.fill \|\| layer\.visible === false\) continue;[\s\S]*ctx\.fillStyle = `\$\{layer\.color\}1A`;/, 'closed loops on fill-enabled layers should render with low-opacity layer color fill');
  assert.match(html, /if \(isLayerLocked\(p\.layerId\)\) \{[\s\S]*Layer .* is locked\./, 'point edits should be blocked when the owning layer is locked');
});


test('VIEWPORT.HTML points manager supports grouping and layer-tinted rows', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="ptGroupBy"[\s\S]*value="layer"[\s\S]*value="code"/, 'points manager should expose a group-by control with Layer and Code options');
  assert.match(html, /let\s+pointsGroupMode\s*=\s*"none"\s*;/, 'points manager should track a group-by mode state for grouped rendering');
  assert.match(html, /\$\("#ptGroupBy"\)\.addEventListener\("change",[\s\S]*pointsGroupMode\s*=\s*String\(event\.target\?\.value\s*\|\|\s*"none"\)/, 'group-by dropdown should update the active grouping mode and rerender');
  assert.match(html, /function\s+pointsGroupLabel\(point\)\s*\{[\s\S]*pointsGroupMode\s*===\s*"layer"[\s\S]*pointsGroupMode\s*===\s*"code"/, 'points manager should compute group labels for both layer and code modes');
  assert.match(html, /function\s+getGroupedPoints\(sortedPoints\)\s*\{[\s\S]*groupsByLabel[\s\S]*map\(\(\[label, groupedPoints\]\) => \(\{ label, points: groupedPoints \}\)\)/, 'points manager should partition sorted points into grouped sections for rendering');
  assert.match(html, /function\s+colorToRgba\(color, alpha = 0\.1\)[\s\S]*return\s+`rgba\(\$\{r\},\$\{g\},\$\{b\},\$\{clamp\(alpha, 0, 1\)\}\)`;/, 'points manager should derive faint row tint colors from layer hex values');
  assert.match(html, /const\s+tint\s*=\s*colorToRgba\(getLayerById\(p\.layerId\)\?\.color,\s*0\.12\);[\s\S]*if\s*\(tint\)\s*tr\.style\.background\s*=\s*tint;/, 'points manager rows should apply a faint background tint from the point layer color');
});


test('VIEWPORT.HTML exposes an FLD editor backed by shared API save/reset and downloads', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="openFldEditor"/, 'LineSmith should expose a toolbar section button for opening the FLD editor');
  assert.match(html, /id="fldModal"/, 'LineSmith should render an FLD editor modal container');
  assert.doesNotMatch(html, /id="fldSymbolGallery"/, 'FLD editor should not include a separate symbol gallery region');
  assert.match(html, /function\s+loadSurveySymbolLibrary\(\)\s*\{[\s\S]*fetch\("\/assets\/survey-symbols\/index\.json"\)/, 'FLD editor should load survey SVG symbol manifest data for symbol mapping choices');
  assert.doesNotMatch(html, /function\s+renderFldSymbolGallery\(config\)/, 'FLD editor should not keep the legacy symbol gallery renderer');
  assert.match(html, /const\s+entityOptions\s*=\s*\[[\s\S]*value:\s*"2", label:\s*"Linework"[\s\S]*value:\s*"1", label:\s*"2D Polyline \(Linework\)"[\s\S]*value:\s*"0", label:\s*"Symbol"/, 'FLD editor should allow choosing linework, 2D polyline linework, or symbol entity types when editing FLD codes');
  assert.match(html, /symbolScaleInput\.type\s*=\s*"number"[\s\S]*rule\.raw\.symbol_size\s*=\s*symbolScaleInput\.value/, 'FLD editor should expose symbol scale editing backed by the FLD symbol_size column');
  assert.match(html, /function\s+buildFldSymbolPreviewPicker\(\{ symbolMapChoices, currentValue, onPick \}\)\s*\{[\s\S]*fldSymbolPickerButton[\s\S]*fldSymbolChoiceBtn/, 'FLD editor should build a dropdown-style preview picker so symbol mappings can be selected visually');
  assert.match(html, /function\s+normalizeSymbolOverrideKey\(symbolName = ""\)\s*\{[\s\S]*toUpperCase\(\)/, 'FLD editor should normalize symbol-override keys case-insensitively so mappings survive symbol casing changes');
  assert.match(html, /function\s+getSymbolMapFileForRule\(rule\)\s*\{[\s\S]*normalizeSymbolOverrideKey\(rule\?\.raw\?\.symbol\)[\s\S]*fieldToFinishRuleState\.symbolSvgOverrides\.get\(symbolName\)/, 'FLD editor should resolve symbol SVG mappings from normalized symbol-name shared overrides first');
  assert.doesNotMatch(html, /Symbol rule: set FLD Symbol name/, 'FLD editor should remove symbol helper copy from type config rows');
  assert.match(html, /lineTypeSelect\.addEventListener\("change", \(\) => \{[\s\S]*rule\.raw\.linetype\s*=\s*lineTypeSelect\.value;/, 'FLD editor should expose linetype selection for linework entity rows');
  assert.match(html, /function\s+normalizeLineworkRuleDefaults\(rule\)\s*\{[\s\S]*rule\.raw\.symbol = "SPT10";[\s\S]*setRuleSymbolMapFile\(rule\.raw, ""\);/, 'FLD editor should enforce default linework symbols and remove symbol SVG mappings for line entities');
  assert.match(html, /function\s+setSymbolMapFileForRule\(rule, value\)\s*\{[\s\S]*setRuleSymbolMapFile\(rule\?\.raw, mappedFile\);[\s\S]*fieldToFinishRuleState\.symbolSvgOverrides\.set\(symbolName, mappedFile\);/, 'FLD editor SVG picker should persist symbol-to-SVG overrides and mirror the selected mapping into FLD row columns');
  assert.match(html, /function\s+saveFldEditorLocalOverride\(\)\s*\{[\s\S]*saveFieldToFinishSettingsToApi\(fldEditorState\.activeConfig\)[\s\S]*applyFieldToFinishConfig\(fldEditorState\.activeConfig, "api"\);/, 'FLD editor save action should persist shared API settings and apply them to active linework rules');
  assert.match(html, /function\s+resetFldEditorToServer\(\)\s*\{[\s\S]*resetFieldToFinishSettingsToServerDefaults\(\)[\s\S]*loadFieldToFinishRulesFromFld\(defaultFldConfigPath\)/, 'FLD editor reset action should clear shared settings and restore the server FLD rules');
  assert.match(html, /function\s+downloadFldLocalOverride\(\)\s*\{[\s\S]*downloadTextFile\("LineSmith-Shared\.fld", serializeFieldToFinishConfig\(fldEditorState\.activeConfig\)\);/, 'FLD editor should support downloading shared FLD files');
  assert.match(html, /<th\s+data-fld-sort-key="code"[\s\S]*<th\s+data-fld-sort-key="companions"/, 'FLD editor should expose sortable headers for primary rule columns');
  assert.match(html, /const\s+fldEditorState\s*=\s*\{[\s\S]*sortKey:\s*"code",[\s\S]*sortDirection:\s*"asc"/, 'FLD editor should persist current sort key and direction in editor state');
  assert.match(html, /const\s+sortedRules\s*=\s*\[\.\.\.rules\]\.sort\(\(a, b\) => \{[\s\S]*getSortableValue\(a, sortKey\)[\s\S]*fldSortableHeaders\.forEach\(\(header\) => \{[\s\S]*header\.textContent\s*=\s*headerSortKey === sortKey/, 'FLD editor should sort rows by active header selection and show sort direction indicators in column labels');
  assert.match(html, /fldSortableHeaders\.forEach\(\(header\) => \{[\s\S]*header\.addEventListener\("click", \(\) => \{[\s\S]*fldEditorState\.sortDirection = fldEditorState\.sortDirection === "asc" \? "desc" : "asc";[\s\S]*renderFldEditorTable\(\);/, 'FLD editor header clicks should toggle ascending\/descending sort and rerender the table');
});


test('VIEWPORT.HTML shows a modern point-link loading overlay while bootstrapping LineSmith', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="lineSmithLoadingOverlay"\s+class="linesmith-loading-overlay"/, 'LineSmith should render a dedicated loading overlay shell');
  assert.match(html, /\.linesmith-loading-overlay\{[\s\S]*background:transparent;[\s\S]*pointer-events:none;/, 'loading overlay should not black out the UI and should remain visually non-blocking');
  assert.match(html, /class="linesmith-loading-network"/, 'loading overlay should include a point-link network visual');
  assert.match(html, /id="linesmithLoadingTraversePath"\s+class="linesmith-loading-route-outline"/, 'loading visual should include a route outline so motion feels like a survey traverse instead of floating points');
  assert.match(html, /class="linesmith-loading-traverse-dot"[\s\S]*<animateMotion\s+dur="30s"\s+repeatCount="indefinite"/, 'loading visual should animate a traverse marker along a longer assembly pass instead of rapid back-and-forth motion');
  assert.match(html, /class="linesmith-loading-segment\s+segment-1"[\s\S]*class="linesmith-loading-segment\s+segment-5"/, 'loading visual should reveal multiple assembly segments in staged order to mimic workspace construction');
  assert.match(html, /class="linesmith-loading-node-ping\s+origin"[\s\S]*class="linesmith-loading-node-ping\s+target"/, 'loading visual should pulse origin/target pings instead of only sinusoidal node movement');
  assert.match(html, /@keyframes\s+linesmithAssembleSegment1[\s\S]*@keyframes\s+linesmithAssembleSegment5/, 'loading styles should define staged 30-second assembly keyframes instead of short oscillation loops');
  assert.match(html, /mask id="linesmithLoadingEdgeFade"/, 'loading network should use an edge-fade mask to avoid hard clipping at the sides');
  assert.doesNotMatch(html, /Demo:/, 'loading copy should not include demo-only labels in production');
  assert.match(html, /id="lineSmithLoadingStage"\s+class="linesmith-loading-stage"/, 'loading overlay should expose status copy for current bootstrap stage');
  assert.match(html, /function\s+showLineSmithLoadingOverlay\(stage = ""\)/, 'bootstrap should include a helper to display the loading overlay');
  assert.match(html, /function\s+setLineSmithLoadingStage\(stage = ""\)/, 'bootstrap should include a helper to update loading stage text');
  assert.match(html, /async function boot\(\) \{[\s\S]*showLineSmithLoadingOverlay\("Connecting survey points…"\);[\s\S]*finally \{[\s\S]*hideLineSmithLoadingOverlay\(\);/, 'boot flow should show the loading animation immediately and hide it when initialization completes');
});

test('VIEWPORT.HTML FLD editor uses click-to-open symbol SVG dropdown without gallery helper text', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /id="fldSymbolGalleryGrid"/, 'FLD editor should not render a separate symbol gallery grid section');
  assert.doesNotMatch(html, /Symbol rule: set Symbol ID \+ SVG and symbol scale\./, 'symbol helper text should be removed from the FLD type config table');
  assert.doesNotMatch(html, /Linework rule: pick linetype from FLD values\./, 'linework helper copy should be removed from the FLD type config table');
  assert.match(html, /function\s+buildFldSymbolPreviewPicker\(\{ symbolMapChoices, currentValue, onPick \}\)\s*\{[\s\S]*fldSymbolPickerButton[\s\S]*fldSymbolPickerMenu/, 'symbol mapping should use a dropdown-style picker with a click target and menu');
  assert.match(html, /typeConfigStack\.append\(symbolIdInput, symbolScaleInput, symbolPreviewPicker\);/, 'symbol rows should render selected SVG preview picker in-place instead of a separate select and gallery');
});

test('VIEWPORT.HTML renders configured survey symbol SVG markers for point codes before falling back to x markers', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /codeSymbolMapFiles:\s*new Map\(\)/, 'field-to-finish state should track symbol SVG mappings per point code');
  assert.match(html, /function\s+applyFieldToFinishConfig\(config, sourceLabel = defaultFldConfigPath\)\s*\{[\s\S]*fieldToFinishRuleState\.symbolSvgOverrides = new Map\(fldEditorState\.symbolSvgOverrides\);[\s\S]*deriveFieldToFinishCodeSetsFromConfig\(config\)/, 'field-to-finish config should load symbol-name SVG overrides before deriving per-code symbol mappings');
  assert.match(html, /if \(entityType === "0" && symbolMapFile\) codeSymbolMapFiles\.set\(code, symbolMapFile\);/, 'FLD symbol rendering should map point codes through symbol-to-SVG mappings');
  assert.match(html, /function\s+getPointSymbolMapFile\(pointCode = ""\)\s*\{[\s\S]*codeSymbolMapFiles\.get\(token\)/, 'point marker rendering should resolve mapped symbol files from point code tokens');
  assert.match(html, /function\s+getSymbolMarkerImage\(symbolMapFile = ""\)\s*\{[\s\S]*image\.src = `\/assets\/survey-symbols\/\$\{encodeURIComponent\(file\)\}`;/, 'marker renderer should load symbol SVG assets from the survey-symbols library');
  assert.match(html, /image\.addEventListener\("load", \(\) => \{[\s\S]*cacheKey\.startsWith\(`\$\{file\}::`\)[\s\S]*draw\(\);[\s\S]*\}, \{ once: true \}\);/, 'marker renderer should redraw automatically after symbol SVG assets finish loading');
  assert.match(html, /const\s+SYMBOL_MARKER_SIZE_PX\s*=\s*30;[\s\S]*const\s+SYMBOL_BOLD_OFFSET_PX\s*=\s*1;/, 'symbol marker rendering should define a 30px marker footprint and explicit bold-pass offsets');
  assert.match(html, /function\s+getTintedSymbolMarker\(symbolMapFile = ""\, layerColor = ""\)\s*\{[\s\S]*markerCanvas\.width = SYMBOL_MARKER_SIZE_PX;[\s\S]*markerCtx\.drawImage\(image, SYMBOL_BOLD_OFFSET_PX, 0, markerCanvas\.width, markerCanvas\.height\);[\s\S]*markerCtx\.globalCompositeOperation = "source-in";[\s\S]*markerCtx\.fillStyle = tint;/, 'point marker rendering should bold thin SVG strokes before applying layer tint');
  assert.match(html, /const pointSymbolMapFile = getPointSymbolMapFile\(p\.code\);[\s\S]*getTintedSymbolMarker\(pointSymbolMapFile, layer\?\.color\);[\s\S]*ctx\.drawImage\(symbolImage, sp\.x - SYMBOL_MARKER_HALF_SIZE_PX, sp\.y - SYMBOL_MARKER_HALF_SIZE_PX, SYMBOL_MARKER_SIZE_PX, SYMBOL_MARKER_SIZE_PX\);[\s\S]*ctx\.moveTo\(sp\.x-5, sp\.y-5\)/, 'point marker draw should use larger centered SVG symbols before falling back to x markers');
});




test('VIEWPORT.HTML formats bearings in DMS symbols and groups shared-bearing segments with aggregate labels', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /let\s+sRound\s*=\s*Math\.round\(s\);[\s\S]*if\s*\(sRound\s*>?=\s*60\)\s*\{[\s\S]*m\s*\+=\s*1;[\s\S]*if\s*\(m\s*>?=\s*60\)\s*\{[\s\S]*d\s*\+=\s*1;[\s\S]*return `\$\{q1\}\$\{d\}°\$\{String\(m\)\.padStart\(2,"0"\)\}'\$\{String\(sRound\)\.padStart\(2,"0"\)\}"\$\{q2\}`;/, 'quadrant bearing formatting should round seconds to whole values and carry overflow through minutes/degrees');
  assert.match(html, /function\s+orientAzimuthClockwiseFromBasis\(az\)\s*\{[\s\S]*const\s+basisAzRaw\s*=\s*basisAzimuthRad\(\);[\s\S]*geometryAzimuthToDrawingAzimuth\(az\)[\s\S]*return\s+fDelta\s*<=\s*rDelta\s*\?\s*forward\s*:\s*reverse;/, 'bearing azimuth should orient clockwise from basis-of-bearing when one is set');
  assert.match(html, /const\s+BEARING_LABEL_ALLOWED_LINE_CODES\s*=\s*new\s+Set\(\["BDY",\s*"BDRY",\s*"BOUNDARY",\s*"SEC",\s*"SECTION",\s*"COR",\s*"SUB",\s*"CL",\s*"ROW",\s*"BEAR"\]\);/, 'bearing labels should restrict rendered linework to the approved code list plus BEAR');
  assert.match(html, /function\s+lineIsEligibleForBearingLabels\(line,\s*startPoint,\s*endPoint\)\s*\{[\s\S]*line\.fieldToFinishBaseCode[\s\S]*splitCodeTokens\(startPoint\?\.code\)[\s\S]*splitCodeTokens\(endPoint\?\.code\)[\s\S]*startTokens\.includes\("BEAR"\)[\s\S]*endTokens\.includes\("BEAR"\)/, 'bearing labels should allow listed linework codes and BEAR point-code overrides');
  assert.match(html, /startTokens\.some\([\s\S]*BEARING_LABEL_ALLOWED_LINE_CODES\.has\(token\)\)[\s\S]*endTokens\.some\([\s\S]*BEARING_LABEL_ALLOWED_LINE_CODES\.has\(token\)\)/, 'bearing labels should also allow approved linework codes detected directly on endpoint point-code tokens');
  assert.match(html, /if\s*\(!getCurveMiddlePoint\(ln\) && lineIsEligibleForBearingLabels\(ln,\s*a,\s*b\)\)\s*\{[\s\S]*lineLabelCandidates\.push\(\{\s*a,\s*b,\s*sa,\s*sb\s*\}\);[\s\S]*\}/, 'draw loop should only queue bearing labels for eligible non-curve coded lines');
  assert.match(html, /const\s+pointDegree\s*=\s*new\s+Map\(\);[\s\S]*const\s+sharedEndpointCanChain\s*=\s*\(endpointId\)\s*=>\s*\{[\s\S]*totalDegree\s*===\s*2\s*&&\s*sameBearingDegree\s*===\s*2;[\s\S]*groups\.push\(\{\s*bearing,\s*segments:\s*component\s*\}\);/, 'bearing grouping should only chain through sequential degree-2 points with no extra connections');
  assert.match(html, /line\.fieldToFinishBaseCode\s*=\s*String\(baseCode\s*\|\|\s*""\)\.trim\(\)\.toUpperCase\(\);/, 'auto-generated field-to-finish lines should persist base code metadata for bearing label eligibility');
  assert.match(html, /const\s+groups\s*=\s*buildBearingLabelGroups\(lineLabelCandidates\);[\s\S]*groups\.sort\([\s\S]*const\s+aDelta\s*=\s*\(aSegment\.measure\.azimuth\s*-\s*baseAz/, 'bearing labels should be ordered clockwise from the basis-of-bearing and then outside-in by radius');
  assert.match(html, /function\s+normalizeReadableBearingTextAngle\(angle\)\s*\{[\s\S]*const\s+right\s*=\s*Math\.cos\(candidate\);[\s\S]*const\s+up\s*=\s*-Math\.sin\(candidate\);[\s\S]*const\s+score\s*=\s*\(right\s*\*\s*2\)\s*\+\s*\(up\s*\*\s*2\)\s*\+\s*\(\(right\s*>\s*0\s*&&\s*up\s*>\s*0\)\s*\?\s*1\s*:\s*0\);[\s\S]*return\s+best;/, 'bearing text should normalize rotation to favor rightward and upward-readable label orientation');
  assert.match(html, /const\s+bearingAngle\s*=\s*normalizeReadableBearingTextAngle\(referenceSegment\.measure\.angle\);[\s\S]*ctx\.rotate\(bearingAngle\);/, 'bearing and distance labels should use normalized readable text angles instead of raw line direction');
  assert.match(html, /const\s+labelAngle\s*=\s*normalizeReadableBearingTextAngle\(angle\);[\s\S]*ctx\.fillText\("BASIS OF BEARING", 0, 0\);/, 'basis-of-bearing title should share readable text-angle normalization so labels do not appear upside down');
  assert.match(html, /const\s+groupLabel\s*=\s*`\$\{referenceSegment\.measure\.bearing\}\s*•\s*\$\{totalDistance\.toFixed\(3\)\}`;[\s\S]*const\s+lengthLabel\s*=\s*segment\.measure\.distance\.toFixed\(3\);/, 'draw loop should render a grouped bearing+total distance label and individual segment distance labels on opposite sides');
});
test('VIEWPORT.HTML supports defining and rendering a labeled basis of bearing from two point references', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /<b>Basis of Bearing<\/b>[\s\S]*id="basisBearingStartPoint"[\s\S]*id="basisBearingEndPoint"/, 'LineSmith should expose start/end point reference inputs for basis-of-bearing');
  assert.match(html, /id="setBasisOfBearing"[\s\S]*id="clearBasisOfBearing"/, 'LineSmith should include set and clear controls for basis-of-bearing');
  assert.match(html, /let\s+basisOfBearing\s*=\s*null;\s*\/\/ \{startPointId, endPointId\}/, 'drawing model should store basis-of-bearing point ids');
  assert.match(html, /function\s+resolvePointByNumberOrName\(reference\)\s*\{[\s\S]*String\(point\?\.num \?\? ""\)\.trim\(\)\.toUpperCase\(\) === normalized/, 'basis-of-bearing should resolve point refs by point number/name');
  assert.match(html, /function\s+sanitizeBasisOfBearing\(value\)\s*\{[\s\S]*const\s+startPointId\s*=\s*Number\(value\?\.startPointId\);[\s\S]*return\s*\{\s*startPointId:\s*startPoint\.id,\s*endPointId:\s*endPoint\.id\s*\};/, 'basis-of-bearing parser should validate point ids and normalize to existing points');
  assert.match(html, /basisOfBearing:\s*basisOfBearing \?[\s\S]*basisOfBearing = sanitizeBasisOfBearing\(s\.basisOfBearing\);/, 'basis-of-bearing should be serialized and restored with drawing state');
  assert.match(html, /setBasisOfBearingBtn\?\.addEventListener\("click", \(\) => \{[\s\S]*resolvePointByNumberOrName\(startRef\);[\s\S]*history\.push\("set basis of bearing"\);[\s\S]*setStatus\("Basis of bearing set from selected points and labeled on the drawing\.", "ok"\);/, 'setting basis-of-bearing should resolve user point refs, create undo history, and show user feedback');
  assert.match(html, /const basisEndpoints = resolveBasisOfBearingEndpoints\(\);[\s\S]*ctx\.setLineDash\(\[8, 6\]\);[\s\S]*ctx\.fillText\("BASIS OF BEARING", 0, 0\);/, 'draw loop should render a dashed basis line and explicit BASIS OF BEARING label using resolved basis endpoints');
});
test('VIEWPORT.HTML supports record basis bearing rotation without modifying world coordinates', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="basisBearingRecordBearing"[\s\S]*id="basisBearingRecordDistance"/, 'basis-of-bearing UI should include record basis bearing and distance inputs');
  assert.match(html, /let\s+recordBasisBearing\s*=\s*"";[\s\S]*let\s+recordBasisDistance\s*=\s*"";/, 'drawing state should track record basis bearing and distance values');
  assert.match(html, /function\s+drawingRotationRad\(\)\s*\{[\s\S]*bearingToAzimuthRad\(recordBasisBearing\)[\s\S]*normalizedSignedAngleDelta\(recordAz, basisAz\);/, 'drawing rotation should be derived from measured basis azimuth and record basis bearing');
  assert.match(html, /function\s+worldToScreen\(x,y\)\s*\{[\s\S]*rotateWorldPointAroundBasis\(x, y\)[\s\S]*\};[\s\S]*function\s+screenToWorld\(x,y\)\s*\{[\s\S]*rotateDrawingPointToWorld\(rotatedX, rotatedY\);/, 'view transforms should rotate rendering around the basis start point while preserving world coordinates');
  assert.match(html, /function\s+lineMeasurement\(a, b\)\s*\{[\s\S]*orientAzimuthClockwiseFromBasis\(Math\.atan2\(dx, dy\)\)/, 'line measurements should report rotated drawing bearings for inspectors and labels');
  assert.match(html, /basisOfBearing:\s*basisOfBearing \?[\s\S]*recordBasisBearing,[\s\S]*recordBasisDistance,/, 'state serialization should persist record basis inputs');
});


test('VIEWPORT.HTML surfaces mapped SVG symbols in quick search, point manager, point editor, cluster tooltip, and point inspector', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+getPointSymbolPreviewUrl\(pointCode = ""\)\s*\{[\s\S]*getPointSymbolMapFile\(pointCode\)[\s\S]*`\/assets\/survey-symbols\/\$\{encodeURIComponent\(symbolMapFile\)\}`;/, 'LineSmith should expose a shared helper that resolves mapped point symbols to survey-symbol asset URLs');
  assert.match(html, /\.pointSymbolBadge\s*\{[\s\S]*background:#ffffff;/, 'mapped symbol badges should render on a white background so black SVG artwork remains visible in UI surfaces');
  assert.match(html, /result\.type === "point"[\s\S]*const pointSymbolUrl = getPointSymbolPreviewUrl\(result\.pointCode\);[\s\S]*quickSearchResultWithSymbol/, 'quick search point suggestions should render mapped symbol thumbnails when a point code has an SVG mapping');
  assert.match(html, /const pointSymbolUrl = getPointSymbolPreviewUrl\(p\.code\);[\s\S]*numberCellWrap\.className = "pointNumberCell"[\s\S]*symbolBadge\.className = "pointSymbolBadge"/, 'point manager rows should render mapped symbol badges next to point numbers when the code has an SVG mapping');
  assert.match(html, /id="pointEditorSymbolRow"[\s\S]*function\s+updatePointEditorFromSelection\(\)\s*\{[\s\S]*pointEditorSymbolRow\.innerHTML = `<img class="pointSymbolBadge"/, 'Add/Edit point panel should show a mapped symbol preview row for the selected point code');
  assert.match(html, /getPointSymbolPreviewUrl\(point\.code\)[\s\S]*class="clusterTooltipPointRow"/, 'cluster tooltip point rows should include mapped symbol badges for each point');
  assert.match(html, /className = "inspectorPointHeader"[\s\S]*symbolBadge\.className = "pointSymbolBadge large"/, 'point inspector should render a large profile-style mapped symbol badge for the selected point');
});



test('VIEWPORT.HTML preloads mapped SVG marker assets and retries failed symbol image fetches', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+preloadMappedPointSymbolMarkers\(\)\s*\{[\s\S]*codeSymbolMapFiles\.values\(\)[\s\S]*Promise\.allSettled\(pendingLoads\)\.then\(\(\) => draw\(\)\);/, 'LineSmith should proactively preload mapped point symbol SVG marker assets and redraw when preloading completes');
  assert.match(html, /function\s+applyFieldToFinishConfig\(config, sourceLabel = defaultFldConfigPath\)\s*\{[\s\S]*preloadMappedPointSymbolMarkers\(\);/, 'LineSmith should trigger symbol marker preloads whenever FLD rules are applied');
  assert.match(html, /image\.addEventListener\("error", \(\) => \{[\s\S]*symbolMarkerImageCache\.delete\(file\);/, 'LineSmith should clear failed image cache entries so symbol SVG fetches can be retried');
});
test('VIEWPORT.HTML keeps FLD manager in quick toolbar and triples symbol marker size', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /id="quickPointManager"[\s\S]*id="quickFtfManager"/, 'secondary quick toolbar should place FLD manager next to points manager');
  assert.match(html, /id="quickFtfManager" class="quickToolBtn" title="Open FLD Editor"/, 'quick toolbar should expose an FLD manager launch button');
  assert.match(html, /\$\("#quickFtfManager"\)\?\.addEventListener\("click", \(\) => openFldEditorBtn\?\.click\(\)\);/, 'FLD quick button should route to the existing FLD editor launcher');
  assert.match(html, /const\s+SYMBOL_MARKER_SIZE_PX\s*=\s*30\s*;/, 'point symbol SVG markers should render at a corrected 30px footprint');
});

test('VIEWPORT.HTML fades map layer visibility and centers/fades the loading modal', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /\.mapBackdrop\{[\s\S]*transition:opacity \.28s ease;/, 'map backdrop should animate opacity changes for smooth map layer show/hide transitions');
  assert.match(html, /function\s+syncMapBackdropVisibility\(\)\s*\{[\s\S]*const\s+targetOpacity\s*=\s*mapLayerState\.enabled\s*\?\s*mapLayerState\.opacity\s*:\s*0;[\s\S]*mapBackdrop\.style\.opacity\s*=\s*String\(clamp\(targetOpacity,\s*0,\s*1\)\);/, 'map layer visibility helper should fade to configured opacity when enabled and to zero when disabled');
  assert.match(html, /function\s+setMapLayerEnabled\(enabled\)\s*\{[\s\S]*syncMapBackdropVisibility\(\);/, 'map enable toggle should route visibility updates through the fade helper');
  assert.match(html, /\.linesmith-loading-overlay\{[\s\S]*display:flex;[\s\S]*align-items:center;[\s\S]*justify-content:center;/, 'loading overlay should center the modal both vertically and horizontally');
  assert.match(html, /\.linesmith-loading-overlay\.hidden\s+\.linesmith-loading-card\{[\s\S]*opacity:0;[\s\S]*transform:translateY\(8px\) scale\(0\.985\);/, 'loading modal card should fade and ease out when the overlay is hidden');
});

test('VIEWPORT.HTML pickLine hit-testing follows three-point curve arc geometry for mobile tap selection', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+pickLine\(screenX, screenY, thresholdPx=8\)\s*\{[\s\S]*const\s+middle\s*=\s*getCurveMiddlePoint\(ln\);[\s\S]*const\s+circle\s*=\s*getCircleFromThreePoints\(pa, middle, pb\);/, 'pickLine should detect when a line is a 3-point curve and compute a circle fit for hit testing');
  assert.match(html, /const\s+sweepToTarget\s*=\s*clockwise[\s\S]*if\s*\(sweepRad > 0 && sweepToTarget <= sweepRad\)\s*\{[\s\S]*cp\s*=\s*\{[\s\S]*t:\s*sweepToTarget \/ sweepRad,/, 'pickLine should project taps onto the valid arc sweep and preserve grip interpolation for curve selections');
  assert.match(html, /if\s*\(!cp\)\s*cp\s*=\s*segmentClosestPoint\(\{x:w\.x,y:w\.y\}, pa, pb\);/, 'pickLine should keep linear-segment fallback behavior for non-curve lines and degenerate arcs');
});

test('VIEWPORT.HTML scopes collaboration rooms to project drawing ids and persists crew drawing preference through API', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /if \(activeProjectId && activeDrawingId\) return drawingStorageKey\(activeProjectId, activeDrawingId\);/, 'collaboration room resolution should prefer project+drawing scoped room keys');
  assert.match(html, /function\s+saveCrewActiveDrawingPreference\(projectId, drawingId\)\s*\{[\s\S]*\/api\/crew\?id=/, 'LineSmith should load the active crew member profile before persisting drawing preference');
  assert.match(html, /lineSmithActiveDrawingByProject/, 'crew profile sync payload should include project-indexed active drawing preferences');
  assert.match(html, /await fetchProjectDrawingById\(activeProjectId, crewDrawingId\)/, 'startup restore flow should attempt loading the active crew drawing through project drawing CRUD API');
  assert.match(html, /saveCrewActiveDrawingPreference\(activeProjectId, drawingId\);/, 'saving drawings should update the active crew drawing preference for cross-device restore');
});

test('VIEWPORT.HTML point inspector shows linked EvidenceDesk point-photo thumbnails and full-size links', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+buildPointPhotoResourceLookup\(projectId\)/, 'LineSmith should build a project-file lookup of uploaded photos keyed by point number');
  assert.match(html, /function\s+getPointPhotoResourceLookup\(projectId\)/, 'LineSmith should cache point-photo lookup results so point-label rendering can check photo links efficiently');
  assert.match(html, /metadata\?\.pointNumber/, 'photo lookup should use uploaded file point-number metadata');
  assert.match(html, /const\s+photoLookup\s*=\s*getPointPhotoResourceLookup\(activeProjectId\);/, 'point inspector should resolve matching project photos from the cached lookup helper');
  assert.match(html, /photoLabel\.textContent\s*=\s*"Point photo"/, 'point inspector should render a Point photo summary row');
  assert.match(html, /img\.className\s*=\s*"inspectorPointPhotoThumb"/, 'point inspector should render a thumbnail image for linked photos');
  assert.match(html, /a\.textContent\s*=\s*`Open photo \$\{pointPhoto\.title \|\| pointPhoto\.pointNumber\}`/, 'point inspector should render a full-size photo link for linked images');
});

test('VIEWPORT.HTML draws a small photo icon beside point numbers when linked EvidenceDesk photos exist', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+drawPointNumberLabel\(ctx, numberText, x, y, pointNumber, pointPhotoLookup, pointDocumentLookup\)\s*\{[\s\S]*ctx\.fillText\("📷", iconX, y\);/, 'point-number label renderer should append a small photo icon for points with linked photos');
  assert.match(html, /const\s+pointPhotoLookup\s*=\s*pointDisplayVisibility\.names\s*\?\s*getPointPhotoResourceLookup\(activeProjectId\)\s*:\s*null;/, 'point rendering should build a photo lookup only when point-number labels are enabled');
  assert.match(html, /drawPointNumberLabel\(ctx, numText, sp\.x \+ 8, sp\.y - 10, p\.num, pointPhotoLookup, pointDocumentLookup\);/, 'regular point labels should use the shared photo-aware point-number label helper');
  assert.match(html, /drawPointNumberLabel\(ctx, numText, labelX, labelY, member\.point\.num, pointPhotoLookup, pointDocumentLookup\);/, 'cluster breakout labels should use the same helper so icons appear in clustered label layouts');
});

test('VIEWPORT.HTML draws a document icon beside point numbers when points reference ROS or CPNF records', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+pointHasDocumentAssociation\(point, rosLookup = null\)\s*\{[\s\S]*parseCpfInstruments\(point\.notes \|\| ""\);[\s\S]*collectPointRosReferences\(point\);/, 'point-document detection should treat both CPNF notes and ROS references as document associations');
  assert.match(html, /const\s+rosLookup\s*=\s*pointDisplayVisibility\.names\s*\?\s*buildRosResourceLookup\(activeProjectId\)\s*:\s*null;/, 'point label rendering should resolve ROS resources while names are visible');
  assert.match(html, /const\s+pointDocumentLookup\s*=\s*new Map\(\);[\s\S]*pointHasDocumentAssociation\(point, rosLookup\)/, 'point label rendering should build a lookup of point numbers that have associated ROS or CPNF documents');
  assert.match(html, /ctx\.fillText\("📄", iconX, y\);/, 'point-number label renderer should append a small document icon when a point has ROS/CPNF associations');
});

test('VIEWPORT.HTML loads selected linked point files into the active drawing state', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /async\s+function\s+loadLinkedPointFileIntoDrawing\(projectId, pointFileId, pointFileName = pointFileId\)/, 'LineSmith should define a helper to fetch and apply linked point file content to the active drawing');
  assert.match(html, /fetch\(buildProjectPointFileApiUrl\(projectId, pointFileId\)\)/, 'linked point-file helper should fetch the selected project point file via API');
  assert.match(html, /points\.clear\(\);[\s\S]*lines\.clear\(\);/, 'linked point-file helper should clear existing points and lines before importing the newly selected file');
  assert.match(html, /importCsvText\(text, `Linked point file import \(\$\{pointFileName\}\)`\)/, 'linked point-file helper should import selected point-file text into drawing geometry');
  assert.match(html, /await\s+loadLinkedPointFileIntoDrawing\(activeProjectId, selectedPointFile\.pointFileId, selectedPointFile\.pointFileName\);/, 'point-file selection flow should immediately load the selected file into the drawing canvas');
});
