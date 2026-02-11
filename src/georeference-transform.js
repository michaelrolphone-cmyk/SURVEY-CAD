export function sanitizeGeoreference(candidate) {
  if (!candidate) return null;
  const latAx = Number(candidate?.lat?.ax);
  const latBy = Number(candidate?.lat?.by);
  const latC = Number(candidate?.lat?.c);
  const lngAx = Number(candidate?.lng?.ax);
  const lngBy = Number(candidate?.lng?.by);
  const lngC = Number(candidate?.lng?.c);
  if (
    !Number.isFinite(latAx) ||
    !Number.isFinite(latBy) ||
    !Number.isFinite(latC) ||
    !Number.isFinite(lngAx) ||
    !Number.isFinite(lngBy) ||
    !Number.isFinite(lngC)
  ) {
    return null;
  }
  return {
    lat: { ax: latAx, by: latBy, c: latC },
    lng: { ax: lngAx, by: lngBy, c: lngC },
  };
}

export function worldToLatLngAffine(x, y, georef) {
  const ref = sanitizeGeoreference(georef);
  if (!ref) return null;
  const lat = ref.lat.ax * x + ref.lat.by * y + ref.lat.c;
  const lng = ref.lng.ax * x + ref.lng.by * y + ref.lng.c;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function latLngToWorldAffine(lat, lng, georef) {
  const ref = sanitizeGeoreference(georef);
  if (!ref) return null;
  const latShift = Number(lat) - ref.lat.c;
  const lngShift = Number(lng) - ref.lng.c;
  if (!Number.isFinite(latShift) || !Number.isFinite(lngShift)) return null;

  const determinant = (ref.lat.ax * ref.lng.by) - (ref.lat.by * ref.lng.ax);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-16) return null;

  const invDet = 1 / determinant;
  const x = ((latShift * ref.lng.by) - (ref.lat.by * lngShift)) * invDet;
  const y = ((ref.lat.ax * lngShift) - (latShift * ref.lng.ax)) * invDet;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y };
}

export function translateLocalPointsToStatePlane(points, anchor) {
  if (!Array.isArray(points) || !points.length) {
    throw new Error('points must be a non-empty array');
  }

  const anchorLocalX = Number(anchor?.anchorLocalX);
  const anchorLocalY = Number(anchor?.anchorLocalY);
  const anchorEast = Number(anchor?.anchorEast);
  const anchorNorth = Number(anchor?.anchorNorth);

  if (
    !Number.isFinite(anchorLocalX) ||
    !Number.isFinite(anchorLocalY) ||
    !Number.isFinite(anchorEast) ||
    !Number.isFinite(anchorNorth)
  ) {
    throw new Error('anchorLocalX, anchorLocalY, anchorEast, and anchorNorth are required numeric values');
  }

  const eastOffset = anchorEast - anchorLocalX;
  const northOffset = anchorNorth - anchorLocalY;

  const localizedPoints = points.map((point, index) => {
    const localX = Number(point?.x);
    const localY = Number(point?.y);
    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      throw new Error(`point at index ${index} is missing numeric x/y coordinates`);
    }

    return {
      ...point,
      x: localX,
      y: localY,
      east: localX + eastOffset,
      north: localY + northOffset,
    };
  });

  return {
    translation: { eastOffset, northOffset },
    anchor: { anchorLocalX, anchorLocalY, anchorEast, anchorNorth },
    points: localizedPoints,
  };
}
