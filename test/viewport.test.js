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
