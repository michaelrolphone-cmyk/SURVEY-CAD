export function normalizeRadians(v) {
  let value = Number(v);
  if (!Number.isFinite(value)) return 0;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function resolveScreenAngleDegrees(screenOrientationAngle) {
  const angle = Number(screenOrientationAngle);
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((angle % 360) + 360) % 360;
  if (wrapped === 90 || wrapped === 180 || wrapped === 270) return wrapped;
  return 0;
}

function resolveHeadingDegrees(orientationEvent) {
  const compassHeading = Number(orientationEvent && orientationEvent.webkitCompassHeading);
  if (Number.isFinite(compassHeading)) return compassHeading;
  const alpha = Number(orientationEvent && orientationEvent.alpha);
  if (Number.isFinite(alpha)) return 360 - alpha;
  return NaN;
}

function resolveTiltDegrees(orientationEvent, screenOrientationAngle) {
  const beta = Number(orientationEvent && orientationEvent.beta);
  const gamma = Number(orientationEvent && orientationEvent.gamma);
  const safeBeta = Number.isFinite(beta) ? beta : 0;
  const safeGamma = Number.isFinite(gamma) ? gamma : 0;
  const angle = resolveScreenAngleDegrees(screenOrientationAngle);

  const pitchLimitDeg = 89;
  if (angle === 90) {
    return {
      pitchDeg: Math.max(-pitchLimitDeg, Math.min(pitchLimitDeg, safeGamma + 90)),
      rollDeg: safeBeta,
    };
  }
  if (angle === 270) {
    return {
      pitchDeg: Math.max(-pitchLimitDeg, Math.min(pitchLimitDeg, 90 - safeGamma)),
      rollDeg: -safeBeta,
    };
  }
  if (angle === 180) {
    return {
      pitchDeg: Math.max(-pitchLimitDeg, Math.min(pitchLimitDeg, 90 - safeBeta)),
      rollDeg: safeGamma,
    };
  }
  return {
    pitchDeg: Math.max(-pitchLimitDeg, Math.min(pitchLimitDeg, safeBeta - 90)),
    rollDeg: -safeGamma,
  };
}

export function deriveDevicePoseRadians(orientationEvent, screenOrientationAngle = 0, headingOffsetRad = 0) {
  const headingDeg = resolveHeadingDegrees(orientationEvent);
  const { pitchDeg, rollDeg } = resolveTiltDegrees(orientationEvent, screenOrientationAngle);
  const headingRad = Number.isFinite(headingDeg)
    ? normalizeRadians((headingDeg * Math.PI / 180) + headingOffsetRad)
    : NaN;

  return {
    headingRad,
    pitchRad: (pitchDeg * Math.PI) / 180,
    rollRad: (rollDeg * Math.PI) / 180,
  };
}

export function shouldApplyOrientationEvent(eventType, orientationEvent, hasAbsoluteLock = false) {
  const explicitAbsoluteType = String(eventType || '').toLowerCase() === 'deviceorientationabsolute';
  const absoluteFlag = orientationEvent && orientationEvent.absolute === true;
  const webkitCompassHeading = Number(orientationEvent && orientationEvent.webkitCompassHeading);
  const hasCompassHeading = Number.isFinite(webkitCompassHeading);
  const isAbsoluteEvent = explicitAbsoluteType || absoluteFlag || hasCompassHeading;
  if (!hasAbsoluteLock) return true;
  return isAbsoluteEvent;
}

export function integrateGyroscopeHeadingRadians(previousHeadingRad, rotationRateAlphaDegPerSec, deltaTimeMs) {
  const prior = Number(previousHeadingRad);
  const safePrior = Number.isFinite(prior) ? prior : 0;
  const rotationRateDegPerSec = Number(rotationRateAlphaDegPerSec);
  const dtMs = Number(deltaTimeMs);
  if (!Number.isFinite(rotationRateDegPerSec) || !Number.isFinite(dtMs) || dtMs <= 0) {
    return normalizeRadians(safePrior);
  }
  const deltaRad = -(rotationRateDegPerSec * Math.PI / 180) * (dtMs / 1000);
  return normalizeRadians(safePrior + deltaRad);
}
