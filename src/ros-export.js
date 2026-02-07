export function csvEscape(value) {
  const v = String(value ?? '');
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function almostSame(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

export function stripClosingDup(ring) {
  if (!ring || ring.length < 2) return ring || [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (almostSame(first[0], last[0]) && almostSame(first[1], last[1])) return ring.slice(0, -1);
  return ring;
}

export function buildParcelCsvPNEZD(parcel2243, startPoint = 1) {
  const rings = parcel2243?.geometry?.rings || [];
  if (!rings.length) throw new Error('Parcel export geometry missing rings.');

  const attrs = parcel2243.attributes || {};
  const parcelId =
    attrs.PARCEL || attrs.Parcel || attrs.PIN || attrs.Pin || attrs.RP || attrs.AIN || attrs.APN ||
    attrs.PARCEL_ID || attrs.PARCELID || attrs.PARCELNO || '';

  const lines = [];
  let pointNumber = startPoint;

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = stripClosingDup(rings[ringIndex]);
    for (let vertexIndex = 0; vertexIndex < ring.length; vertexIndex++) {
      const east = Number(ring[vertexIndex][0]);
      const north = Number(ring[vertexIndex][1]);
      if (!Number.isFinite(east) || !Number.isFinite(north)) continue;

      const desc = `PARCEL_VERTEX${parcelId ? ` ${parcelId}` : ''} R${ringIndex + 1} V${vertexIndex + 1}`;
      lines.push([
        pointNumber,
        north.toFixed(3),
        east.toFixed(3),
        '0.000',
        csvEscape(desc),
      ].join(','));

      pointNumber += 1;
    }
  }

  if (!lines.length) throw new Error('No vertices emitted for parcel CSV.');
  return { csv: `${lines.join('\n')}\n`, nextPoint: pointNumber };
}

function centroidFromRings(rings) {
  const ring = stripClosingDup((rings || [])[0] || []);
  if (!ring.length) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
  }
  return { x: sx / ring.length, y: sy / ring.length };
}

function aliquotLabel(feature, index) {
  const attrs = feature?.attributes || {};
  return (
    attrs.ALIQUOT || attrs.ALIQUOT_LABEL || attrs.LegalDescription || attrs.LEGAL || attrs.DESCRIPTION ||
    `ALIQUOT_${index + 1}`
  );
}

export function buildAliquotCsvRowsPNEZD(aliquotFeatures2243, startPoint = 1) {
  const features = aliquotFeatures2243 || [];
  const lines = [];
  let pointNumber = startPoint;

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const centroid = centroidFromRings(feature?.geometry?.rings || []);
    if (!centroid) continue;

    lines.push([
      pointNumber,
      centroid.y.toFixed(3),
      centroid.x.toFixed(3),
      '0.000',
      csvEscape(`ALIQUOT_CENTROID ${aliquotLabel(feature, i)}`),
    ].join(','));
    pointNumber += 1;
  }

  return { csv: lines.length ? `${lines.join('\n')}\n` : '', nextPoint: pointNumber, count: lines.length };
}
