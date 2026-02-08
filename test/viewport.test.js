import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('VIEWPORT.HTML only treats strict boolean true as movable for point/line drag', async () => {
  const html = await readFile(new URL('../VIEWPORT.HTML', import.meta.url), 'utf8');

  assert.match(html, /function\s+isMovable\(value\)\s*\{\s*return\s+value\s*===\s*true;\s*\}/, 'movable helper should require strict true');
  assert.match(html, /if \(selectedPointId === pid && isMovable\(p\?\.movable\)\)/, 'point drag should require strict movable true');
  assert.match(html, /if \(isMovable\(ln\?\.movable\)\)\s*\{\s*history\.push\("move line"\)/, 'line drag should require strict movable true');
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
  assert.match(html, /#showPointCodes"\)\.addEventListener\("change"/, 'code visibility toggle should be wired to change events');
  assert.match(html, /#showPointNotes"\)\.addEventListener\("change"/, 'notes visibility toggle should be wired to change events');
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
  assert.match(html, /mapTileTypeInput\.addEventListener\("change"[\s\S]*mapLayerState\.tileType\s*=\s*String\(mapTileTypeInput\.value\s*\|\|\s*"satellite"\)/, 'map tile selector should update current tileset');
  assert.match(html, /mapOpacityInput\.addEventListener\("input"[\s\S]*mapLayerState\.opacity\s*=\s*clamp\(parseNum\(mapOpacityInput\.value,\s*10\)\s*\/\s*100,\s*0,\s*1\)/, 'opacity slider should update map backdrop opacity');
  assert.match(html, /function\s+zoomExtents\(options\s*=\s*\{\}\)/, 'zoom extents helper should accept options for silent and history-safe recentering');
  assert.match(html, /if \(mapLayerState\.enabled\) \{[\s\S]*if \(points\.size > 0\) \{[\s\S]*zoomExtents\(\{ skipHistory: true, silent: true \}\);/, 'enabling map layer should reframe to drawing extents without mutating undo history');
});
