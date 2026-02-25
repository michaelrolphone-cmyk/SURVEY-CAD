function buildUrl(path, query = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function requestJson(path, query = {}, options = {}) {
  const timeoutMs = Number(options.timeoutMs);
  const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const controller = hasTimeout ? new AbortController() : null;
  const timer = hasTimeout
    ? setTimeout(() => controller.abort(new Error('Request timed out.')), timeoutMs)
    : null;

  const fetchOptions = {
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  };
  delete fetchOptions.timeoutMs;
  if (controller) fetchOptions.signal = controller.signal;

  let res;
  try {
    res = await fetch(buildUrl(path, query), fetchOptions);
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error('Request timed out.');
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

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

export async function loadSubdivisionAtPoint(lon, lat, outSR = 4326) {
  const payload = await requestJson('/api/subdivision', { lon, lat, outSR });
  return payload.subdivision || null;
}

export async function loadUtilitiesByAddress(address, outSROrOptions = 2243) {
  const options = typeof outSROrOptions === 'object' && outSROrOptions !== null
    ? outSROrOptions
    : { outSR: outSROrOptions };
  const payload = await requestJson('/api/utilities', {
    address,
    outSR: options.outSR ?? 2243,
    sources: Array.isArray(options.sources) ? options.sources.join(',') : options.sources,
  }, {
    timeoutMs: options.timeoutMs,
  });
  return payload.utilities || [];
}

export function buildRosPdfProxyUrl(url) {
  return buildUrl('/api/ros-pdf', { url });
}
