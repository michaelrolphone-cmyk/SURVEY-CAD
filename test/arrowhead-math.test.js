import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDevicePoseRadians, normalizeRadians, shouldApplyOrientationEvent } from '../src/arrowhead-math.js';

test('normalizeRadians wraps values into [-PI, PI]', () => {
  assert.equal(normalizeRadians(Math.PI * 3), Math.PI);
  assert.equal(normalizeRadians(-Math.PI * 3), -Math.PI);
});

test('deriveDevicePoseRadians prioritizes webkitCompassHeading and heading offset', () => {
  const pose = deriveDevicePoseRadians(
    { webkitCompassHeading: 30, alpha: 200, beta: 10, gamma: -15 },
    0,
    Math.PI / 2,
  );

  assert.ok(Number.isFinite(pose.headingRad));
  assert.ok(Math.abs(pose.headingRad - normalizeRadians((30 * Math.PI / 180) + (Math.PI / 2))) < 1e-10);
  assert.ok(Math.abs(pose.pitchRad - (10 * Math.PI / 180)) < 1e-10);
  assert.ok(Math.abs(pose.rollRad - (-15 * Math.PI / 180)) < 1e-10);
});

test('deriveDevicePoseRadians remaps tilt for landscape-right screens', () => {
  const pose = deriveDevicePoseRadians({ alpha: 120, beta: 40, gamma: 10 }, 90, 0);
  assert.ok(Math.abs(pose.pitchRad - (10 * Math.PI / 180)) < 1e-10);
  assert.ok(Math.abs(pose.rollRad - (-40 * Math.PI / 180)) < 1e-10);
  assert.ok(Math.abs(pose.headingRad - normalizeRadians((360 - 120) * Math.PI / 180)) < 1e-10);
});

test('deriveDevicePoseRadians returns NaN heading when heading data is unavailable', () => {
  const pose = deriveDevicePoseRadians({ beta: 5, gamma: 2 }, 0, 0);
  assert.ok(Number.isNaN(pose.headingRad));
});

test('shouldApplyOrientationEvent prefers absolute heading updates after absolute lock', () => {
  assert.equal(shouldApplyOrientationEvent('deviceorientation', { alpha: 130, absolute: false }, false), true);
  assert.equal(shouldApplyOrientationEvent('deviceorientationabsolute', { alpha: 130, absolute: true }, false), true);

  assert.equal(shouldApplyOrientationEvent('deviceorientation', { alpha: 130, absolute: false }, true), false);
  assert.equal(shouldApplyOrientationEvent('deviceorientationabsolute', { alpha: 130, absolute: true }, true), true);
  assert.equal(shouldApplyOrientationEvent('deviceorientation', { webkitCompassHeading: 270 }, true), true);
});
