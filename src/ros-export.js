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

function polygonFeatureLabel(feature, fallbackPrefix, index) {
  const attrs = feature?.attributes || {};
  return (
    attrs.ALIQUOT || attrs.ALIQUOT_LABEL || attrs.SUB_NAME || attrs.SUBDIVISION || attrs.NAME ||
    attrs.PARCEL || attrs.PIN || attrs.PARCELID || attrs.LEGAL || attrs.DESCRIPTION ||
    `${fallbackPrefix}_${index + 1}`
  );
}

export function buildPolygonCornerCsvRowsPNEZD(features2243, startPoint = 1, labelPrefix = 'POLYGON_CORNER') {
  const features = features2243 || [];
  const lines = [];
  let pointNumber = startPoint;

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const rings = feature?.geometry?.rings || [];
    const label = polygonFeatureLabel(feature, labelPrefix, i);

    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
      const ring = stripClosingDup(rings[ringIndex]);
      for (let vertexIndex = 0; vertexIndex < ring.length; vertexIndex++) {
        const east = Number(ring[vertexIndex][0]);
        const north = Number(ring[vertexIndex][1]);
        if (!Number.isFinite(east) || !Number.isFinite(north)) continue;

        lines.push([
          pointNumber,
          north.toFixed(3),
          east.toFixed(3),
          '0.000',
          csvEscape(`${labelPrefix} ${label} R${ringIndex + 1} V${vertexIndex + 1}`),
        ].join(','));
        pointNumber += 1;
      }
    }
  }

  return { csv: lines.length ? `${lines.join('\n')}\n` : '', nextPoint: pointNumber, count: lines.length };
}

export function buildPointMarkerCsvRowsPNEZD(markers2243, startPoint = 1, labelPrefix = 'MARKER') {
  const markers = markers2243 || [];
  const lines = [];
  let pointNumber = startPoint;

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i] || {};
    const east = Number(marker.east);
    const north = Number(marker.north);
    if (!Number.isFinite(east) || !Number.isFinite(north)) continue;

    lines.push([
      pointNumber,
      north.toFixed(3),
      east.toFixed(3),
      '0.000',
      csvEscape(`${labelPrefix} ${marker.label || `POINT_${i + 1}`}`),
    ].join(','));
    pointNumber += 1;
  }

  return { csv: lines.length ? `${lines.join('\n')}\n` : '', nextPoint: pointNumber, count: lines.length };
}
