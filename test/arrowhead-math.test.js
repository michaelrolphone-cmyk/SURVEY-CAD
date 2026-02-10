import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDevicePoseRadians, integrateGyroscopeHeadingRadians, normalizeRadians, shouldApplyOrientationEvent } from '../src/arrowhead-math.js';

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
  assert.ok(Math.abs(pose.pitchRad - (-80 * Math.PI / 180)) < 1e-10);
  assert.ok(Math.abs(pose.rollRad - (-15 * Math.PI / 180)) < 1e-10);
});

test('deriveDevicePoseRadians remaps tilt for landscape-right screens', () => {
  const pose = deriveDevicePoseRadians({ alpha: 120, beta: 40, gamma: 10 }, 90, 0);
  assert.ok(Math.abs(pose.pitchRad - (89 * Math.PI / 180)) < 1e-10);
  assert.ok(Math.abs(pose.rollRad - (-40 * Math.PI / 180)) < 1e-10);
  assert.ok(Math.abs(pose.headingRad - normalizeRadians((360 - 120) * Math.PI / 180)) < 1e-10);
});



test('deriveDevicePoseRadians keeps horizon-level portrait posture near zero pitch', () => {
  const uprightPortrait = deriveDevicePoseRadians({ alpha: 0, beta: 90, gamma: 0 }, 0, 0);
  assert.ok(Math.abs(uprightPortrait.pitchRad) < 1e-10);

  const uprightLandscapeRight = deriveDevicePoseRadians({ alpha: 0, beta: 0, gamma: -90 }, 90, 0);
  assert.ok(Math.abs(uprightLandscapeRight.pitchRad) < 1e-10);
});

test('deriveDevicePoseRadians returns NaN heading when heading data is unavailable', () => {
  const pose = deriveDevicePoseRadians({ beta: 5, gamma: 2 }, 0, 0);
  assert.ok(Number.isNaN(pose.headingRad));
});

test('deriveDevicePoseRadians ignores null compass heading and uses alpha updates', () => {
  const pose = deriveDevicePoseRadians({ webkitCompassHeading: null, alpha: 45, beta: 90, gamma: 0 }, 0, 0);
  assert.ok(Number.isFinite(pose.headingRad));
  assert.ok(Math.abs(pose.headingRad - normalizeRadians((360 - 45) * Math.PI / 180)) < 1e-10);
});

test('shouldApplyOrientationEvent prefers absolute heading updates after absolute lock', () => {
  assert.equal(shouldApplyOrientationEvent('deviceorientation', { alpha: 130, absolute: false }, false), true);
  assert.equal(shouldApplyOrientationEvent('deviceorientationabsolute', { alpha: 130, absolute: true }, false), true);

  assert.equal(shouldApplyOrientationEvent('deviceorientation', { alpha: 130, absolute: false }, true), false);
  assert.equal(shouldApplyOrientationEvent('deviceorientationabsolute', { alpha: 130, absolute: true }, true), true);
  assert.equal(shouldApplyOrientationEvent('deviceorientation', { webkitCompassHeading: 270 }, true), true);
});

test('shouldApplyOrientationEvent falls back to relative events when absolute stream stalls', () => {
  const lastAbsoluteEventAtMs = 1_000;
  const staleNowMs = lastAbsoluteEventAtMs + 2_000;
  const freshNowMs = lastAbsoluteEventAtMs + 200;

  assert.equal(
    shouldApplyOrientationEvent('deviceorientation', { alpha: 130, absolute: false }, true, lastAbsoluteEventAtMs, freshNowMs, 1_500),
    false,
  );

  assert.equal(
    shouldApplyOrientationEvent('deviceorientation', { alpha: 130, absolute: false }, true, lastAbsoluteEventAtMs, staleNowMs, 1_500),
    true,
  );
});

test('shouldApplyOrientationEvent does not treat null compass heading as absolute data', () => {
  assert.equal(
    shouldApplyOrientationEvent('deviceorientation', { webkitCompassHeading: null, absolute: false, alpha: 130 }, true, 1_000, 1_200, 1_500),
    false,
  );

  assert.equal(
    shouldApplyOrientationEvent('deviceorientation', { webkitCompassHeading: null, absolute: false, alpha: 130 }, true, 1_000, 3_000, 1_500),
    true,
  );
});

test('integrateGyroscopeHeadingRadians accumulates alpha rotation over time', () => {
  const quarterTurnPerSecond = 90;
  const updated = integrateGyroscopeHeadingRadians(0, quarterTurnPerSecond, 1000);
  assert.ok(Math.abs(updated - (-Math.PI / 2)) < 1e-10);

  const wrapped = integrateGyroscopeHeadingRadians(Math.PI * 0.9, -quarterTurnPerSecond, 2000);
  assert.ok(Number.isFinite(wrapped));
  assert.ok(wrapped <= Math.PI && wrapped >= -Math.PI);
});

test('integrateGyroscopeHeadingRadians ignores invalid samples', () => {
  assert.equal(integrateGyroscopeHeadingRadians(0.3, NaN, 10), normalizeRadians(0.3));
  assert.equal(integrateGyroscopeHeadingRadians(0.3, 15, 0), normalizeRadians(0.3));
  assert.equal(integrateGyroscopeHeadingRadians(NaN, 15, -1), 0);
});
