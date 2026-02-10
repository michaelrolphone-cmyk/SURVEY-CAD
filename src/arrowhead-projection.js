import { normalizeRadians } from './arrowhead-math.js';

export function resolvePointElevationFeet(pointZFeet, deviceElevationFeet) {
  const z = Number(pointZFeet);
  if (!Number.isFinite(z) || Math.abs(z) < 1e-9) return Number(deviceElevationFeet) || 0;
  return z;
}

export function computeRelativeBearingRad(targetBearingRad, headingRad) {
  return normalizeRadians(headingRad - targetBearingRad);
}

export function computeForwardDistanceMeters(horizontalDistanceMeters, relativeBearingRad) {
  const distance = Number(horizontalDistanceMeters);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return distance * Math.cos(Number(relativeBearingRad) || 0);
}
