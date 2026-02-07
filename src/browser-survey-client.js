function buildUrl(path, query = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function requestJson(path, query = {}, options = {}) {
  const res = await fetch(buildUrl(path, query), {
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `HTTP ${res.status}`);
  }
  return payload;
}

export async function lookupByAddress(address) {
  return requestJson('/api/lookup', { address });
}

export async function findParcelNearPoint(lon, lat, outSR = 4326, searchMeters = 40) {
  const payload = await requestJson('/api/parcel', { lon, lat, outSR, searchMeters });
  return payload.parcel || null;
}

export async function loadSectionAtPoint(lon, lat) {
  const payload = await requestJson('/api/section', { lon, lat });
  return payload.section || null;
}

export async function loadAliquotsAtPoint(lon, lat, outSR = 4326) {
  return requestJson('/api/aliquots', { lon, lat, outSR });
}
