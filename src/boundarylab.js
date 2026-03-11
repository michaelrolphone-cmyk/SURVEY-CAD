export function normalizeAzimuth(azimuth = 0) {
  const normalized = Number(azimuth) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export const LINEAR_CLOSURE_TOLERANCE = 0.01;

export function normalizeAngleDiff(angle = 0) {
  const normalized = ((Number(angle) + 180) % 360 + 360) % 360;
  return normalized - 180;
}

export function formatDegrees(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}°` : '—';
}


export function formatDms(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  let abs = Math.abs(value);
  let degrees = Math.floor(abs);
  abs = (abs - degrees) * 60;
  let minutes = Math.floor(abs);
  let seconds = (abs - minutes) * 60;

  if (seconds >= 59.9995) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    degrees += 1;
  }

  const secText = seconds.toFixed(2).padStart(5, '0');
  return `${sign}${degrees}°${String(minutes).padStart(2, '0')}'${secText}"`;
}

export function parseBearing(value = '') {
  const source = String(value || '').trim().toUpperCase();
  if (!source) return null;

  const compact = source
    .replace(/[º°]/g, 'D')
    .replace(/[′']/g, 'M')
    .replace(/[″"]/g, 'S')
    .replace(/\s+/g, '');

  let match = compact.match(/^([NS])([0-9]{1,3}(?:\.[0-9]+)?)([EW])$/);
  if (match) {
    const [, ns, degRaw, ew] = match;
    const angle = Number(degRaw);
    if (!Number.isFinite(angle) || angle < 0 || angle > 90.000001) return null;
    return { ns, ew, angle };
  }

  match = compact.match(/^([NS])([0-9]{1,3})D([0-9]{1,2}(?:\.[0-9]+)?)(?:M([0-9]{1,2}(?:\.[0-9]+)?))?(?:S)?([EW])$/);
  if (!match) return null;

  const [, ns, degRaw, minRaw, secRaw, ew] = match;
  const degrees = Number(degRaw);
  const minutes = Number(minRaw || 0);
  const seconds = Number(secRaw || 0);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;

  const angle = degrees + (minutes / 60) + (seconds / 3600);
  if (angle < 0 || angle > 90.000001) return null;
  return { ns, ew, angle };
}

export function bearingToAzimuth(parsedBearing) {
  if (!parsedBearing) return NaN;
  const { ns, ew, angle } = parsedBearing;
  if (ns === 'N' && ew === 'E') return normalizeAzimuth(angle);
  if (ns === 'N' && ew === 'W') return normalizeAzimuth(360 - angle);
  if (ns === 'S' && ew === 'E') return normalizeAzimuth(180 - angle);
  if (ns === 'S' && ew === 'W') return normalizeAzimuth(180 + angle);
  return NaN;
}

export function azimuthToBearing(azimuth) {
  if (!Number.isFinite(azimuth)) return '—';
  const normalized = normalizeAzimuth(azimuth);
  const northSouth = normalized <= 180 ? 'N' : 'S';
  const eastWest = normalized <= 90 || normalized >= 270 ? 'E' : 'W';
  const angleToAxis = normalized <= 90
    ? normalized
    : normalized <= 180
      ? 180 - normalized
      : normalized <= 270
        ? normalized - 180
        : 360 - normalized;

  if (Math.abs(angleToAxis) <= 1e-9) return `${northSouth} 0°00'00.00" ${eastWest}`;
  if (Math.abs(angleToAxis - 90) <= 1e-9) return `${northSouth} 90°00'00.00" ${eastWest}`;
  return `${northSouth} ${formatDms(angleToAxis)} ${eastWest}`;
}

export function calculateTraverseFromOrderedCalls({
  orderedCalls = [],
  startPoint = { x: 0, y: 0, pointNumber: 1 },
} = {}) {
  const base = {
    x: Number.parseFloat(startPoint?.x) || 0,
    y: Number.parseFloat(startPoint?.y) || 0,
    pointNumber: Number.isFinite(startPoint?.pointNumber) ? startPoint.pointNumber : 1,
  };

  const points = [{ ...base }];
  let current = { x: base.x, y: base.y };
  let totalLength = 0;
  let startAzimuth = null;
  let endAzimuth = null;

  orderedCalls.forEach((call, index) => {
    const parsed = parseBearing(call?.bearing || '');
    const azimuth = bearingToAzimuth(parsed);
    const distance = Number.parseFloat(call?.distance);
    if (!Number.isFinite(azimuth) || !Number.isFinite(distance)) return;

    if (startAzimuth === null) startAzimuth = azimuth;
    endAzimuth = azimuth;
    totalLength += Math.abs(distance);

    const azRad = (azimuth * Math.PI) / 180;
    const dE = distance * Math.sin(azRad);
    const dN = distance * Math.cos(azRad);
    current = { x: current.x + dE, y: current.y + dN };
    points.push({ x: current.x, y: current.y, pointNumber: base.pointNumber + index + 1 });
  });

  const closureDx = current.x - base.x;
  const closureDy = current.y - base.y;
  const linearMisclosure = points.length > 1 ? Math.hypot(closureDx, closureDy) : null;
  const closureIsLinear = Number.isFinite(linearMisclosure) && linearMisclosure <= LINEAR_CLOSURE_TOLERANCE;
  const closureAzimuth = Number.isFinite(linearMisclosure) && linearMisclosure > LINEAR_CLOSURE_TOLERANCE
    ? normalizeAzimuth((Math.atan2(-closureDx, -closureDy) * 180) / Math.PI)
    : null;
  const angularMisclosure = Number.isFinite(startAzimuth) && Number.isFinite(endAzimuth)
    ? (closureIsLinear ? 0 : Math.abs(normalizeAngleDiff(endAzimuth - startAzimuth)))
    : null;

  return {
    points,
    totalLength,
    linearMisclosure,
    angularMisclosure,
    closureAzimuth,
    closureBearing: closureIsLinear ? 'Closed' : azimuthToBearing(closureAzimuth),
    closureIsLinear,
    startAzimuth,
    endAzimuth,
    endPoint: points.at(-1) || null,
    closureDx,
    closureDy,
  };
}

export function closureRatio(totalLength, linearMisclosure) {
  if (!Number.isFinite(totalLength) || totalLength <= 0 || !Number.isFinite(linearMisclosure)) return null;
  if (Math.abs(linearMisclosure) <= 1e-9) return Infinity;
  return totalLength / linearMisclosure;
}

export function buildTraverseCsvPNEZD(points, { startPointNumber = 1 } = {}) {
  if (!points || !points.length) return '';
  const lines = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const num = startPointNumber + i;
    const easting = pt.x.toFixed(3);
    const northing = pt.y.toFixed(3);
    lines.push(`${num},${easting},${northing},0.000,TRAV`);
  }
  return lines.join('\n');
}
