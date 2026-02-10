import { normalizeRadians } from './arrowhead-math.js';

export function resolvePointElevationFeet(pointZFeet, deviceElevationFeet) {
  const z = Number(pointZFeet);
  if (!Number.isFinite(z) || Math.abs(z) < 1e-9) return Number(deviceElevationFeet) || 0;
  return z;
}

export function computeObserverElevationFeet(deviceElevationFeet, baselinePointElevationFeet, offsetFeet = 3) {
  const device = Number(deviceElevationFeet);
  if (Number.isFinite(device)) return device + (Number(offsetFeet) || 0);

  const baseline = Number(baselinePointElevationFeet);
  if (Number.isFinite(baseline)) return baseline + (Number(offsetFeet) || 0);

  return Number(offsetFeet) || 0;
}

export function computeRelativeBearingRad(targetBearingRad, headingRad) {
  return normalizeRadians(targetBearingRad - headingRad);
}

export function computeForwardDistanceMeters(horizontalDistanceMeters, relativeBearingRad) {
  const distance = Number(horizontalDistanceMeters);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return distance * Math.cos(Number(relativeBearingRad) || 0);
}

export function projectEnuPointToScreen(options) {
  const east = Number(options && options.eastMeters);
  const north = Number(options && options.northMeters);
  const up = Number(options && options.upMeters);
  const heading = Number(options && options.headingRad);
  const pitch = Number(options && options.pitchRad);
  const roll = Number(options && options.rollRad);
  const width = Number(options && options.viewportWidthPx);
  const height = Number(options && options.viewportHeightPx);
  const verticalFov = Number(options && options.verticalFovRad);
  const nearClip = Number(options && options.nearClipMeters);
  const rollCompensationGain = Number(options && options.rollCompensationGain);

  if (!Number.isFinite(east) || !Number.isFinite(north) || !Number.isFinite(up)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (!Number.isFinite(verticalFov) || verticalFov <= 0 || verticalFov >= Math.PI) return null;

  const clipDistance = Number.isFinite(nearClip) && nearClip > 0 ? nearClip : 0.5;
  const safeHeading = Number.isFinite(heading) ? heading : 0;
  const safePitch = Number.isFinite(pitch) ? pitch : 0;
  const safeRollGain = Number.isFinite(rollCompensationGain) ? rollCompensationGain : 1.0;
  const safeRoll = Number.isFinite(roll) ? -roll * safeRollGain : 0;

  // Rotation matrix: Yaw (Z) → Pitch (X') → Roll (Y'') order
  // This matches the typical DeviceOrientation convention
  const ch = Math.cos(safeHeading);
  const sh = Math.sin(safeHeading);
  const cp = Math.cos(safePitch);
  const sp = Math.sin(safePitch);
  const cr = Math.cos(safeRoll);
  const sr = Math.sin(safeRoll);

  // Matrix elements (world → camera)
  const m11 = ch * cr + sh * sp * sr;
  const m12 = sh * cp;
  const m13 = ch * sr - sh * sp * cr;
  const m21 = -sh * cr + ch * sp * sr;
  const m22 = ch * cp;
  const m23 = -sh * sr - ch * sp * cr;
  const m31 = -cp * sr;
  const m32 = sp;
  const m33 = cp * cr;

  // Transform ENU point to camera space
  const xCamera = east * m11 + north * m12 + up * m13;
  const yCamera = east * m21 + north * m22 + up * m23;
  const zCamera = east * m31 + north * m32 + up * m33;

  if (!(zCamera > clipDistance)) return null;

  // Projection using correct aspect ratio handling
  const aspect = width / height;
  const halfVFovTan = Math.tan(verticalFov * 0.5);
  const halfHFovTan = aspect * halfVFovTan;

  const xNdc = xCamera / zCamera;
  const yNdc = yCamera / zCamera;

  const xPx = (width / 2) * (1 + xNdc / halfHFovTan);
  const yPx = (height / 2) * (1 - yNdc / halfVFovTan);  // Y inverted for screen

  return {
    x: xPx,
    y: yPx,
    forwardMeters: zCamera,
  };
}
