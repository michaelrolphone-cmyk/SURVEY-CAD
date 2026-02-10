import test from 'node:test';
import assert from 'node:assert/strict';

import { projectEnuPointToScreen } from '../src/arrowhead-projection.js';

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

test('projectEnuPointToScreen applies roll with the same handedness as device roll', () => {
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
  assert.ok(rollLeft.y > noRoll.y, 'a right-side point should move lower on screen when phone rolls left');
});
