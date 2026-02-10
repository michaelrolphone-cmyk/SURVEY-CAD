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
  
  // Apply roll compensation with a conservative gain (0.5 works well for most devices)
  // Negative sign accounts for the camera-space coordinate system
  const safeRollGain = Number.isFinite(rollCompensationGain) ? rollCompensationGain : 0.5;
  const safeRoll = Number.isFinite(roll) ? -(roll * safeRollGain) : 0;

  // 1. Apply heading rotation (yaw around vertical axis)
  const cosHeading = Math.cos(safeHeading);
  const sinHeading = Math.sin(safeHeading);
  const xYaw = east * cosHeading - north * sinHeading;
  const zYaw = east * sinHeading + north * cosHeading;
  const yYaw = up; // FIXED: Don't scale the vertical coordinate

  // 2. Apply pitch rotation (around horizontal axis)
  const cosPitch = Math.cos(safePitch);
  const sinPitch = Math.sin(safePitch);
  const yPitch = yYaw * cosPitch - zYaw * sinPitch;
  const zPitch = yYaw * sinPitch + zYaw * cosPitch;

  // 3. Apply roll rotation (around depth axis)
  const cosRoll = Math.cos(safeRoll);
  const sinRoll = Math.sin(safeRoll);
  const xCamera = xYaw * cosRoll - yPitch * sinRoll;
  const yCamera = xYaw * sinRoll + yPitch * cosRoll;
  const zCamera = zPitch;

  // Check if point is in front of camera
  if (!(zCamera > clipDistance)) return null;

  // Project to screen coordinates
  const horizontalFov = 2 * Math.atan((width / height) * Math.tan(verticalFov * 0.5));
  const xFromCenter = (xCamera / zCamera) * ((width * 0.5) / Math.tan(horizontalFov * 0.5));
  const yFromCenter = (yCamera / zCamera) * ((height * 0.5) / Math.tan(verticalFov * 0.5));

  return {
    x: (width * 0.5) + xFromCenter,
    y: (height * 0.5) - yFromCenter,
    forwardMeters: zCamera,
  };
}
