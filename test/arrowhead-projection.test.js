import test from 'node:test';
import assert from 'node:assert/strict';

import { computeObserverElevationFeet, projectEnuPointToScreen, resolvePointElevationFeet } from '../src/arrowhead-projection.js';

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} ~= ${expected}`);
}

test('projectEnuPointToScreen keeps a forward point centered', () => {
  const scr = projectEnuPointToScreen({
    eastMeters: 0,
    northMeters: 20,
    upMeters: 0,
    headingRad: 0,
    pitchRad: 0,
    rollRad: 0,
    viewportWidthPx: 1000,
    viewportHeightPx: 500,
    verticalFovRad: 68 * Math.PI / 180,
    nearClipMeters: 0.5,
  });

  assert.ok(scr);
  approx(scr.x, 500);
  approx(scr.y, 250);
});

test('projectEnuPointToScreen culls points behind camera after pitch crosses horizon', () => {
  const visibleBeforeCrossing = projectEnuPointToScreen({
    eastMeters: 0,
    northMeters: 20,
    upMeters: 0,
    headingRad: 0,
    pitchRad: 0.2,
    rollRad: 0,
    viewportWidthPx: 1000,
    viewportHeightPx: 500,
    verticalFovRad: 68 * Math.PI / 180,
    nearClipMeters: 0.5,
  });
  assert.ok(visibleBeforeCrossing);

  const behindAfterCrossing = projectEnuPointToScreen({
    eastMeters: 0,
    northMeters: 20,
    upMeters: 0,
    headingRad: 0,
    pitchRad: 1.8,
    rollRad: 0,
    viewportWidthPx: 1000,
    viewportHeightPx: 500,
    verticalFovRad: 68 * Math.PI / 180,
    nearClipMeters: 0.5,
  });

  assert.equal(behindAfterCrossing, null);
});

test('projectEnuPointToScreen applies roll so overlays rotate with the camera feed', () => {
  const noRoll = projectEnuPointToScreen({
    eastMeters: 8,
    northMeters: 20,
    upMeters: 0,
    headingRad: 0,
    pitchRad: 0,
    rollRad: 0,
    viewportWidthPx: 1000,
    viewportHeightPx: 500,
    verticalFovRad: 68 * Math.PI / 180,
    nearClipMeters: 0.5,
  });
  const rollLeft = projectEnuPointToScreen({
    eastMeters: 8,
    northMeters: 20,
    upMeters: 0,
    headingRad: 0,
    pitchRad: 0,
    rollRad: -Math.PI / 6,
    viewportWidthPx: 1000,
    viewportHeightPx: 500,
    verticalFovRad: 68 * Math.PI / 180,
    nearClipMeters: 0.5,
  });

  assert.ok(noRoll && rollLeft);
  assert.ok(rollLeft.y < noRoll.y, 'a right-side point should move higher on screen when phone rolls left so overlays follow camera roll');
});


test('resolvePointElevationFeet falls back when point elevation is missing or zero', () => {
  assert.equal(resolvePointElevationFeet(0, 123.4), 123.4);
  assert.equal(resolvePointElevationFeet('0', 55), 55);
  assert.equal(resolvePointElevationFeet(98.7, 12), 98.7);
});

test('computeObserverElevationFeet adds default 3 foot offset above GPS or baseline point elevation', () => {
  assert.equal(computeObserverElevationFeet(100, 20), 103);
  assert.equal(computeObserverElevationFeet(NaN, 40), 43);
  assert.equal(computeObserverElevationFeet(undefined, undefined), 3);
  assert.equal(computeObserverElevationFeet(100, 40, 5), 105);
});
