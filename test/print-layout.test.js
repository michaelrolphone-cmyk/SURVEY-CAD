import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseClosestPrintScale, resolveLandscapePaperSizeInches } from '../src/print-layout.js';

test('resolveLandscapePaperSizeInches returns landscape dimensions for preset and custom sizes', () => {
  const a4 = resolveLandscapePaperSizeInches({ preset: 'A4' });
  assert.ok(a4.widthIn > a4.heightIn);
  assert.ok(Math.abs(a4.widthIn - (297 / 25.4)) < 0.001);

  const custom = resolveLandscapePaperSizeInches({ preset: 'custom', customWidthMm: 210, customHeightMm: 420 });
  assert.ok(custom.widthIn > custom.heightIn);
  assert.ok(Math.abs(custom.widthIn - (420 / 25.4)) < 0.001);
});

test('chooseClosestPrintScale snaps selection to nearest allowed survey print scale', () => {
  const result = chooseClosestPrintScale({
    worldWidthFeet: 100,
    worldHeightFeet: 50,
    paperWidthIn: 16.54,
    paperHeightIn: 11.69,
    marginIn: 0.5
  });

  assert.equal(result.selectedScale, 100);
  assert.ok(result.targetScale > 70 && result.targetScale < 80);
  assert.deepEqual(result.scales, [1, 5, 10, 20, 30, 40, 50, 100, 200, 500, 1000]);
});
