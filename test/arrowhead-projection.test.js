import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRelativeBearingRad, resolvePointElevationFeet } from '../src/arrowhead-projection.js';

test('resolvePointElevationFeet falls back to device elevation for zero, missing, and NaN values', () => {
  assert.equal(resolvePointElevationFeet(0, 5234.25), 5234.25);
  assert.equal(resolvePointElevationFeet(undefined, 5234.25), 5234.25);
  assert.equal(resolvePointElevationFeet('NaN', 5234.25), 5234.25);
  assert.equal(resolvePointElevationFeet(5198.5, 5234.25), 5198.5);
});

test('computeRelativeBearingRad uses heading-target handedness so camera pan direction is correct', () => {
  const headingNorth = 0;
  const targetEast = Math.PI / 2;
  const relative = computeRelativeBearingRad(targetEast, headingNorth);
  assert.ok(relative < 0, 'east target should project left when user is facing north and has panned left');

  const wrapped = computeRelativeBearingRad(-Math.PI + 0.1, Math.PI - 0.1);
  assert.ok(Math.abs(Math.abs(wrapped) - 0.2) < 1e-10, 'relative bearing should normalize across +/-PI wraparound');
});
