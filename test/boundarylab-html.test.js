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
