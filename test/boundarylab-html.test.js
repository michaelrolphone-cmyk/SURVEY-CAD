import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('BoundaryLab UI shows angular error in DMS format', async () => {
  const html = await readFile(path.join(rootDir, 'BoundaryLab.html'), 'utf8');
  assert.match(html, /formatDms\(traversal\.angularMisclosure\)/);
  assert.doesNotMatch(html, /formatDegrees\(traversal\.angularMisclosure\)/);
});

test('BoundaryLab preserves active call input focus during rerender', async () => {
  const html = await readFile(path.join(rootDir, 'BoundaryLab.html'), 'utf8');
  assert.match(html, /function captureActiveInputState\(/);
  assert.match(html, /function restoreActiveInputState\(/);
  assert.match(html, /renderRows\(captureActiveInputState\(\)\)/);
  assert.match(html, /nextInput\.focus\(\{ preventScroll: true \}\)/);
});

test('BoundaryLab stacks preview below call table on mobile and resizes canvas to viewport pixels', async () => {
  const html = await readFile(path.join(rootDir, 'BoundaryLab.html'), 'utf8');
  assert.match(html, /@media \(max-width: 960px\) \{[\s\S]*\.layout \{ grid-template-columns: 1fr; \}[\s\S]*canvas \{ height: min\(56vh, 420px\); \}/);
  assert.match(html, /function resizeCanvasToDisplaySize\(\) \{[\s\S]*window\.devicePixelRatio[\s\S]*canvas\.width = displayWidth;[\s\S]*canvas\.height = displayHeight;/);
  assert.match(html, /window\.addEventListener\('resize', render\);/);
});
