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

export function buildAliquotSelectionKey(feature, index = 0) {
  const attrs = feature?.attributes || {};
  const identity =
    attrs.OBJECTID ?? attrs.ObjectID ?? attrs.OBJECTID_1 ?? attrs.FID ?? attrs.GLOBALID ?? attrs.GlobalID ?? null;
  if (identity != null && String(identity).trim()) {
    return `oid:${String(identity).trim()}`;
  }

  const label = attrs.ALIQUOT || attrs.ALIQUOT_LABEL || attrs.NAME || '';
  if (String(label).trim()) {
    return `label:${String(label).trim().toUpperCase()}:${index}`;
  }
  return `index:${index}`;
}

export function filterParcelFeatureForExport(parcelFeature2243, selectedParcel = true) {
  return selectedParcel ? (parcelFeature2243 || null) : null;
}

export function filterAliquotFeaturesForExport(aliquotFeatures2243 = [], selectedAliquotKeys = null) {
  const features = aliquotFeatures2243 || [];
  if (!(selectedAliquotKeys instanceof Set) || !selectedAliquotKeys.size) return features;
  return features.filter((feature, index) => selectedAliquotKeys.has(buildAliquotSelectionKey(feature, index)));
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

    const markerLabel = String(marker.code || marker.label || `POINT_${i + 1}`);
    const prefix = String(labelPrefix || '').trim();
    const description = prefix ? `${prefix} ${markerLabel}` : markerLabel;

    lines.push([
      pointNumber,
      north.toFixed(3),
      east.toFixed(3),
      '0.000',
      csvEscape(description),
    ].join(','));
    pointNumber += 1;
  }

  return { csv: lines.length ? `${lines.join('\n')}\n` : '', nextPoint: pointNumber, count: lines.length };
}

function utilityPointCodeForExport(utility = {}) {
  const serviceTypeId = Number(utility?.serviceTypeId);
  const rawCode = String(utility?.code || utility?.name || '').toUpperCase();

  if (/\bTRANSF\b|\bTX\b|TRANSFORMER/.test(rawCode)) return 'TRANSF';
  if (serviceTypeId === 1 || /\bPM\b|METER|CONNECTION/.test(rawCode)) return 'PM';
  if (serviceTypeId === 3 || /\bOH\b|OVERHEAD/.test(rawCode)) return 'OH';
  if (serviceTypeId === 2 || /\bUG\b|\bUP\b|UNDERGROUND/.test(rawCode)) return 'UP';
  return 'UP';
}

export function buildPowerUtilityMarkersForPointForge(utilities2243, startPoint = 1) {
  const points = (utilities2243 || [])
    .map((utility, index) => ({
      east: Number(utility?.projected?.east),
      north: Number(utility?.projected?.north),
      utility,
      index,
      pointCode: utilityPointCodeForExport(utility),
    }))
    .filter((point) => Number.isFinite(point.east) && Number.isFinite(point.north));

  if (!points.length) return [];

  const meterIndex = points.findIndex((point) => point.pointCode === 'PM');
  const connectionPoint = meterIndex >= 0 ? points[meterIndex] : points[0];
  const downstream = points
    .filter((_, index) => index !== (meterIndex >= 0 ? meterIndex : 0))
    .sort((a, b) => {
      const order = { OH: 0, UP: 1 };
      return (order[a.pointCode] ?? 99) - (order[b.pointCode] ?? 99);
    });

  return [
    {
      east: connectionPoint.east,
      north: connectionPoint.north,
      code: 'PM',
    },
    ...downstream.map((point) => ({
      east: point.east,
      north: point.north,
      code: point.pointCode,
    })),
  ];
}

export function buildUniquePolygonCsvRowsPNEZD(features2243, startPoint = 1, labelPrefix = 'POLYGON_CORNER') {
  const features = features2243 || [];
  const lines = [];
  const seen = new Set();
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

        const key = `${east.toFixed(9)},${north.toFixed(9)}`;
        if (seen.has(key)) continue;
        seen.add(key);

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

function normalizeRingPoints(feature, source) {
  const out = [];
  const rings = feature?.geometry?.rings || [];
  for (const ring of rings) {
    const trimmed = stripClosingDup(ring);
    for (const vertex of trimmed) {
      const east = Number(vertex?.[0]);
      const north = Number(vertex?.[1]);
      if (!Number.isFinite(east) || !Number.isFinite(north)) continue;
      out.push({ east, north, source });
    }
  }
  return out;
}

function inferBoundaryRole(feature) {
  const attrs = feature?.attributes || {};
  const hasParcelIdentity = [
    attrs.PARCEL,
    attrs.Parcel,
    attrs.PIN,
    attrs.Pin,
    attrs.RP,
    attrs.AIN,
    attrs.APN,
    attrs.PARCEL_ID,
    attrs.PARCELID,
    attrs.PARCELNO,
  ].some((value) => String(value ?? '').trim());
  if (hasParcelIdentity) return 'parcel';

  const hasSubdivisionIdentity = [
    attrs.SUB_NAME,
    attrs.SUBDIVISION,
    attrs.SUB,
    attrs.PLAT_NAME,
    attrs.PLATNAME,
  ].some((value) => String(value ?? '').trim());
  if (hasSubdivisionIdentity) return 'subdivision';

  return null;
}

function ringArea(ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i] || [];
    const [x2, y2] = ring[(i + 1) % ring.length] || [];
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    area += (x1 * y2) - (x2 * y1);
  }
  return Math.abs(area / 2);
}

function polygonArea(feature) {
  const rings = feature?.geometry?.rings || [];
  if (!rings.length) return 0;
  return rings.reduce((sum, ring) => sum + ringArea(stripClosingDup(ring)), 0);
}

function sectionExtent(sectionFeature) {
  const ring = stripClosingDup(sectionFeature?.geometry?.rings?.[0] || []);
  if (!ring.length) return null;
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  for (const [x, y] of ring) {
    xmin = Math.min(xmin, x);
    ymin = Math.min(ymin, y);
    xmax = Math.max(xmax, x);
    ymax = Math.max(ymax, y);
  }
  if (!Number.isFinite(xmin) || !Number.isFinite(ymin) || !Number.isFinite(xmax) || !Number.isFinite(ymax)) return null;
  return { xmin, ymin, xmax, ymax };
}

function nearFraction(value, targets, tol = 0.03) {
  return targets.some((target) => Math.abs(value - target) <= tol);
}

function classifyPlssCode(east, north, sectionFeature) {
  const ext = sectionExtent(sectionFeature);
  if (!ext) return '16COR';

  const w = Math.max(1e-9, ext.xmax - ext.xmin);
  const h = Math.max(1e-9, ext.ymax - ext.ymin);
  const nx = (east - ext.xmin) / w;
  const ny = (north - ext.ymin) / h;

  const onEdgeX = nearFraction(nx, [0, 1]);
  const onEdgeY = nearFraction(ny, [0, 1]);
  const onMidX = nearFraction(nx, [0.5]);
  const onMidY = nearFraction(ny, [0.5]);

  if (onMidX && onMidY) return 'CSECOR';
  if (onEdgeX && onEdgeY) return 'SECOR';
  if ((onMidX && onEdgeY) || (onMidY && onEdgeX)) return '14COR';
  return '16COR';
}

export function buildRosBoundaryCsvRowsPNEZD({
  parcelFeature2243,
  subdivisionFeature2243,
  sectionFeature2243,
  aliquotFeatures2243 = [],
  startPoint = 1,
  notesByCoordinate = new Map(),
  includePlssWithoutNotes = true,
} = {}) {
  let resolvedParcelFeature = parcelFeature2243;
  let resolvedSubdivisionFeature = subdivisionFeature2243;
  const parcelRole = inferBoundaryRole(parcelFeature2243);
  const subdivisionRole = inferBoundaryRole(subdivisionFeature2243);
  const parcelArea = polygonArea(parcelFeature2243);
  const subdivisionArea = polygonArea(subdivisionFeature2243);
  const hasComparableAreas = Number.isFinite(parcelArea)
    && Number.isFinite(subdivisionArea)
    && parcelArea > 0
    && subdivisionArea > 0;
  const shouldSwapByRole = parcelRole === 'subdivision'
    && subdivisionRole === 'parcel'
    && hasComparableAreas
    && parcelArea >= subdivisionArea;
  const shouldSwapByAreaHeuristic = hasComparableAreas
    && (parcelRole !== 'parcel' || subdivisionRole !== 'subdivision')
    && parcelArea > (subdivisionArea * 1.05);
  if (shouldSwapByRole || shouldSwapByAreaHeuristic) {
    resolvedParcelFeature = subdivisionFeature2243;
    resolvedSubdivisionFeature = parcelFeature2243;
  }

  const points = new Map();
  const sources = [
    ...normalizeRingPoints(resolvedParcelFeature, 'parcel'),
    ...normalizeRingPoints(resolvedSubdivisionFeature, 'subdivision'),
    ...aliquotFeatures2243.flatMap((feature) => normalizeRingPoints(feature, 'aliquot')),
  ];

  for (const point of sources) {
    const key = `${point.east.toFixed(9)},${point.north.toFixed(9)}`;
    const existing = points.get(key) || { east: point.east, north: point.north, sources: new Set() };
    existing.sources.add(point.source);
    points.set(key, existing);
  }

  const lines = [];
  let pointNumber = startPoint;

  for (const [key, point] of points.entries()) {
    const isPlssOnlyPoint = !point.sources.has('parcel') && !point.sources.has('subdivision');
    let code = 'COR';
    if (point.sources.has('parcel')) code = 'COR';
    else if (point.sources.has('subdivision')) code = 'SUB';
    else if (point.sources.has('aliquot') || point.sources.has('section')) {
      code = classifyPlssCode(point.east, point.north, sectionFeature2243);
    }

    const note = notesByCoordinate.get(key) || '';
    if (!includePlssWithoutNotes && isPlssOnlyPoint && !String(note).trim()) continue;
    lines.push([
      pointNumber,
      point.north.toFixed(3),
      point.east.toFixed(3),
      '0.000',
      csvEscape(code),
      csvEscape(note),
    ].join(','));
    pointNumber += 1;
  }

  return { csv: lines.length ? `${lines.join('\n')}\n` : '', nextPoint: pointNumber, count: lines.length, points };
}
