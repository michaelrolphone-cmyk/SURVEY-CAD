import test from 'node:test';
import assert from 'node:assert/strict';
import { computeForwardDistanceMeters, computeRelativeBearingRad, resolvePointElevationFeet } from '../src/arrowhead-projection.js';

test('resolvePointElevationFeet falls back to device elevation for zero, missing, and NaN values', () => {
  assert.equal(resolvePointElevationFeet(0, 5234.25), 5234.25);
  assert.equal(resolvePointElevationFeet(undefined, 5234.25), 5234.25);
  assert.equal(resolvePointElevationFeet('NaN', 5234.25), 5234.25);
  assert.equal(resolvePointElevationFeet(5198.5, 5234.25), 5198.5);
});

test('computeRelativeBearingRad uses target-heading handedness so world geometry rotates against head turns', () => {
  const headingNorth = 0;
  const targetEast = Math.PI / 2;
  const relative = computeRelativeBearingRad(targetEast, headingNorth);
  assert.ok(relative > 0, 'east target should project to the right when user is facing north');

  const wrapped = computeRelativeBearingRad(-Math.PI + 0.1, Math.PI - 0.1);
  assert.ok(Math.abs(Math.abs(wrapped) - 0.2) < 1e-10, 'relative bearing should normalize across +/-PI wraparound');
});


test('computeForwardDistanceMeters rejects targets behind the camera heading', () => {
  const distance = 25;
  assert.equal(computeForwardDistanceMeters(distance, 0), 25);
  assert.equal(computeForwardDistanceMeters(distance, Math.PI), -25);

  const headingNorth = 0;
  const targetSouth = Math.PI;
  const relativeSouth = computeRelativeBearingRad(targetSouth, headingNorth);
  assert.ok(computeForwardDistanceMeters(distance, relativeSouth) < 0, 'south target should be behind while facing north');

  const targetEast = Math.PI / 2;
  const relativeEast = computeRelativeBearingRad(targetEast, headingNorth);
  assert.ok(Math.abs(computeForwardDistanceMeters(distance, relativeEast)) < 1e-10, 'east target should be on the horizon edge while facing north');
});
