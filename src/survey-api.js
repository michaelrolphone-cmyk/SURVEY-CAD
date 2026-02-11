const DEFAULTS = {
  adaMapServer: "https://adacountyassessor.org/arcgis/rest/services/External/ExternalMap/MapServer",
  layers: {
    address: 16,
    ros: 17,
    subdivisions: 18,
    townships: 19,
    sections: 20,
    parcels: 24,
  },
  blmFirstDivisionLayer:
    "https://gis.blm.gov/idarcgis/rest/services/realty/BLM_ID_CADNSDI_PLSS_First_Division/MapServer/0",
  blmSecondDivisionLayer:
    "https://gis.blm.gov/idarcgis/rest/services/realty/BLM_ID_CADNSDI_PLSS_Second_Division/MapServer/0",
  nominatimUrl: "https://nominatim.openstreetmap.org/search",
  nominatimUserAgent: "survey-cad/1.0 (contact: admin@example.com)",
  nominatimEmail: "admin@example.com",
  arcgisGeocodeUrl:
    "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates",
  idahoPowerUtilityLookupUrl: "https://tools.idahopower.com/ServiceEstimator/api/ResidentialUtilities",
  arcgisGeometryProjectUrl: "https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer/project",
};

const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

function isUpstreamHttpError(err) {
  return /^HTTP\s+\d{3}:/i.test(String(err?.message || ''));
}

function buildUtilityLookupCandidates(baseUrl, address) {
  const candidates = [];

  const primary = new URL(baseUrl);
  primary.searchParams.set('address', address);
  candidates.push(primary.toString());

  if (/\/ResidentialUtilities\/?$/i.test(primary.pathname)) {
    const fallback = new URL(primary.toString());
    fallback.pathname = fallback.pathname.replace(/\/ResidentialUtilities\/?$/i, '/Utilities');
    fallback.searchParams.set('address', address);
    candidates.push(fallback.toString());
  }

  return [...new Set(candidates)];
}

function normalizeSpaces(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

export function parseAddress(rawAddress) {
  const raw = normalizeSpaces(rawAddress);
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const streetPart = (parts[0] || "").toUpperCase();
  const cityPart = (parts[1] || "").replace(/\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i, "");

  const tokens = streetPart.split(/\s+/).filter(Boolean);
  const house = /^\d+[A-Z]?$/.test(tokens[0] || "") ? tokens.shift() : "";
  const preDir = DIRS.has(tokens[0]) ? tokens.shift() : "";
  const postDir = DIRS.has(tokens.at(-1)) ? tokens.pop() : "";

  let suffix = "";
  if (tokens.length > 1 && /^[A-Z]{2,5}$/.test(tokens.at(-1))) {
    suffix = tokens.pop();
  }

  const streetName = tokens.join(" ");
  return { raw, house, preDir, streetName, suffix, postDir, city: cityPart };
}

export function buildAddressWhere(parsed) {
  const p = typeof parsed === "string" ? parseAddress(parsed) : parsed;
  const clauses = [];
  if (p.house) clauses.push(`ADDRNUM = '${escapeSql(p.house)}'`);
  if (p.preDir) clauses.push(`PREDIR = '${escapeSql(p.preDir)}'`);
  if (p.streetName) clauses.push(`UPPER(STREETNAME) LIKE '${escapeSql(p.streetName)}%'`);
  if (p.suffix) clauses.push(`SUFFIX = '${escapeSql(p.suffix)}'`);
  if (p.postDir) clauses.push(`POSTDIR = '${escapeSql(p.postDir)}'`);
  if (p.city) clauses.push(`UPPER(CITY) LIKE '${escapeSql(p.city.toUpperCase())}%'`);
  return clauses.length ? clauses.join(" AND ") : "1=1";
}

export function buildFallbackAddressWhere(parsed) {
  const p = typeof parsed === "string" ? parseAddress(parsed) : parsed;
  const clauses = [];
  if (p.house) clauses.push(`ADDRNUM = '${escapeSql(p.house)}'`);
  if (p.streetName) clauses.push(`UPPER(STREETNAME) LIKE '${escapeSql(p.streetName)}%'`);
  if (p.city) clauses.push(`UPPER(CITY) LIKE '${escapeSql(p.city.toUpperCase())}%'`);
  return clauses.length ? clauses.join(" AND ") : "1=1";
}

function escapeSql(v) {
  return String(v).replace(/'/g, "''");
}

export function scoreAddressCandidate(parsed, attrs = {}) {
  const p = typeof parsed === "string" ? parseAddress(parsed) : parsed;
  let score = 0;
  const up = (v) => String(v || "").toUpperCase();

  if (p.house && up(attrs.ADDRNUM) === up(p.house)) score += 5;
  if (p.preDir && up(attrs.PREDIR) === up(p.preDir)) score += 2;
  if (p.streetName && up(attrs.STREETNAME).startsWith(up(p.streetName))) score += 6;
  if (p.suffix && up(attrs.SUFFIX) === up(p.suffix)) score += 2;
  if (p.postDir && up(attrs.POSTDIR) === up(p.postDir)) score += 1;
  if (p.city && up(attrs.CITY).startsWith(up(p.city))) score += 3;
  return score;
}

export function arcgisQueryUrl(layerUrl, paramsObj) {
  const base = layerUrl.endsWith("/query") ? layerUrl : `${layerUrl.replace(/\/$/, "")}/query`;
  const u = new URL(base);
  for (const [k, v] of Object.entries(paramsObj || {})) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  u.searchParams.set("f", "json");
  return u.toString();
}

export function pointInRing(pointXY, ring) {
  let inside = false;
  const [x, y] = pointXY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-30) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(pointXY, geom) {
  const rings = geom?.rings || [];
  if (!rings.length) return false;
  if (!pointInRing(pointXY, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(pointXY, rings[i])) return false;
  }
  return true;
}

export function centroidOfPolygon(geom) {
  const ring = geom?.rings?.[0] || [];
  if (!ring.length) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
    n += 1;
  }
  return { x: sx / n, y: sy / n };
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function findObjectIdAttribute(attrs = {}) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === "") continue;
    if (/^(OBJECTID|FID)$/i.test(key) || /_?OBJECTID$/i.test(key)) {
      return { field: key, value };
    }
  }
  return null;
}

function pickContainingOrNearest(features, lon, lat) {
  if (!features.length) return null;

  const containing = features.find((f) => pointInPolygon([lon, lat], f.geometry));
  if (containing) return containing;

  let nearest = null;
  let nearestMeters = Infinity;
  for (const feature of features) {
    const centroid = centroidOfPolygon(feature.geometry);
    if (!centroid) continue;
    const meters = haversineMeters(lat, lon, centroid.y, centroid.x);
    if (meters < nearestMeters) {
      nearestMeters = meters;
      nearest = feature;
    }
  }

  return nearest || features[0];
}

export class SurveyCadClient {
  constructor(options = {}) {
    this.config = {
      ...DEFAULTS,
      ...options,
      layers: { ...DEFAULTS.layers, ...(options.layers || {}) },
    };
  }

  async fetchJson(url, opts = {}) {
    const ctrl = new AbortController();
    const timeoutMs = opts.timeoutMs ?? 25000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, ...opts });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      const payload = await res.json();
      if (payload?.error) {
        throw new Error(payload.error.message || "ArcGIS error");
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async geocodeAddress(address) {
    try {
      return await this.geocodeAddressNominatim(address);
    } catch {
      return this.geocodeAddressArcGis(address);
    }
  }

  async geocodeAddressNominatim(address) {
    const u = new URL(this.config.nominatimUrl);
    u.searchParams.set("q", address);
    u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1");
    u.searchParams.set("addressdetails", "1");
    if (this.config.nominatimEmail) {
      u.searchParams.set("email", this.config.nominatimEmail);
    }
    const result = await this.fetchJson(u.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": this.config.nominatimUserAgent,
      },
    });
    if (!result?.length) throw new Error("No geocode results.");
    return { lat: Number(result[0].lat), lon: Number(result[0].lon), display: result[0].display_name };
  }

  async geocodeAddressArcGis(address) {
    const u = new URL(this.config.arcgisGeocodeUrl);
    u.searchParams.set("SingleLine", address);
    u.searchParams.set("maxLocations", "1");
    u.searchParams.set("outFields", "Match_addr,LongLabel");
    u.searchParams.set("f", "json");

    const result = await this.fetchJson(u.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": this.config.nominatimUserAgent,
      },
    });

    const candidate = result?.candidates?.[0];
    if (!candidate?.location) throw new Error("No geocode results.");
    return {
      lat: Number(candidate.location.y),
      lon: Number(candidate.location.x),
      display: candidate.address || candidate.attributes?.LongLabel || candidate.attributes?.Match_addr || "",
    };
  }

  async arcQuery(layerId, params) {
    const layerUrl = `${this.config.adaMapServer}/${layerId}`;
    const url = arcgisQueryUrl(layerUrl, params);
    return this.fetchJson(url);
  }

  async projectPoints(points = [], inSR = 4326, outSR = 2243) {
    if (!Array.isArray(points) || !points.length || inSR === outSR) {
      return points;
    }

    const url = new URL(this.config.arcgisGeometryProjectUrl);
    url.searchParams.set('f', 'json');
    url.searchParams.set('inSR', String(inSR));
    url.searchParams.set('outSR', String(outSR));
    url.searchParams.set('geometries', JSON.stringify({
      geometryType: 'esriGeometryPoint',
      geometries: points.map((point) => ({ x: Number(point.x), y: Number(point.y) })),
    }));

    const payload = await this.fetchJson(url.toString());
    return payload?.geometries || [];
  }

  normalizeUtilityLocation(entry = {}) {
    const geometry = entry.geometry || entry.location || {};
    const attrs = entry.attributes || entry.properties || {};

    const lon = Number(
      geometry.x ?? geometry.lon ?? geometry.lng ?? geometry.longitude ?? entry.lon ?? entry.lng ?? entry.longitude,
    );
    const lat = Number(
      geometry.y ?? geometry.lat ?? geometry.latitude ?? entry.lat ?? entry.latitude,
    );

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    const spatialReference = geometry.spatialReference || entry.spatialReference || {};
    const wkid = Number(spatialReference.wkid || spatialReference.latestWkid || 4326);

    return {
      id: String(attrs.id || attrs.ID || attrs.OBJECTID || attrs.objectid || entry.id || `${lon},${lat}`),
      name: String(attrs.name || attrs.NAME || entry.name || entry.utilityName || 'Utility location'),
      provider: String(attrs.provider || attrs.PROVIDER || entry.provider || 'Idaho Power'),
      geometry: {
        x: lon,
        y: lat,
        spatialReference: { wkid },
      },
    };
  }

  async lookupUtilitiesByAddress(address, outSR = 4326) {
    const candidates = buildUtilityLookupCandidates(this.config.idahoPowerUtilityLookupUrl, address);

    let payload = null;
    let lastError = null;
    for (const candidate of candidates) {
      try {
        payload = await this.fetchJson(candidate);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!payload) {
      if (isUpstreamHttpError(lastError)) {
        return [];
      }
      throw lastError;
    }

    const rawUtilities = payload?.features || payload?.utilities || payload?.results || [];
    const normalized = rawUtilities
      .map((entry) => this.normalizeUtilityLocation(entry))
      .filter(Boolean);

    if (!normalized.length) {
      return [];
    }

    const groupedByWkid = new Map();
    normalized.forEach((utility, index) => {
      const wkid = Number(utility?.geometry?.spatialReference?.wkid || 4326);
      if (!groupedByWkid.has(wkid)) groupedByWkid.set(wkid, []);
      groupedByWkid.get(wkid).push({ utility, index });
    });

    const output = [...normalized];
    for (const [wkid, group] of groupedByWkid.entries()) {
      if (wkid === outSR) continue;
      const projected = await this.projectPoints(group.map(({ utility }) => utility.geometry), wkid, outSR);
      for (let i = 0; i < group.length; i += 1) {
        const projectedPoint = projected[i];
        if (!projectedPoint) continue;
        output[group[i].index] = {
          ...output[group[i].index],
          projected: {
            east: Number(projectedPoint.x),
            north: Number(projectedPoint.y),
            spatialReference: { wkid: outSR },
          },
        };
      }
    }

    return output.map((utility) => {
      const lon = Number(utility.geometry.x);
      const lat = Number(utility.geometry.y);
      const projected = utility.projected || (outSR === 4326
        ? { east: lon, north: lat, spatialReference: { wkid: 4326 } }
        : null);

      return {
        id: utility.id,
        name: utility.name,
        provider: utility.provider,
        location: { lon, lat },
        projected,
      };
    });
  }

  async findBestAddressFeature(rawAddress) {
    const parsed = parseAddress(rawAddress);
    const response = await this.arcQuery(this.config.layers.address, {
      where: buildAddressWhere(parsed),
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
    });

    let features = response.features || [];
    if (!features.length) {
      const fallbackResponse = await this.arcQuery(this.config.layers.address, {
        where: buildFallbackAddressWhere(parsed),
        outFields: "*",
        returnGeometry: true,
        outSR: 4326,
      });
      features = fallbackResponse.features || [];
    }

    if (!features.length) return null;

    const scored = features
      .map((f) => ({ feature: f, score: scoreAddressCandidate(parsed, f.attributes || {}) }))
      .sort((a, b) => b.score - a.score);

    return scored[0].feature;
  }

  async findParcelNearPoint(lon, lat, outSR = 4326, searchMeters = 40) {
    const response = await this.arcQuery(this.config.layers.parcels, {
      where: "1=1",
      geometry: { x: lon, y: lat, spatialReference: { wkid: 4326 } },
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      distance: searchMeters,
      units: "esriSRUnit_Meter",
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
    });

    const best = pickContainingOrNearest(response.features || [], lon, lat);
    if (!best || outSR === 4326) return best;

    try {
      return (await this.refetchFeatureInOutSR(this.config.layers.parcels, best, outSR)) || best;
    } catch {
      return best;
    }
  }

  async findContainingPolygon(layerId, lon, lat, searchMeters = 2000) {
    const response = await this.arcQuery(layerId, {
      where: "1=1",
      geometry: { x: lon, y: lat, spatialReference: { wkid: 4326 } },
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      distance: searchMeters,
      units: "esriSRUnit_Meter",
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
    });

    const features = response.features || [];
    const containing = features.find((f) => pointInPolygon([lon, lat], f.geometry));
    return containing || features[0] || null;
  }

  async findRosNearPoint(lon, lat, searchMeters = 1600) {
    const response = await this.arcQuery(this.config.layers.ros, {
      where: "1=1",
      geometry: { x: lon, y: lat, spatialReference: { wkid: 4326 } },
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      distance: searchMeters,
      units: "esriSRUnit_Meter",
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
    });

    return (response.features || [])
      .map((feature) => {
        const g = feature.geometry || {};
        const meters = g.x != null && g.y != null ? haversineMeters(lat, lon, g.y, g.x) : Infinity;
        return { feature, meters };
      })
      .sort((a, b) => a.meters - b.meters);
  }

  async findContainingPolygonWithOutSr(layerId, lon, lat, outSR = 4326, searchMeters = 2000) {
    const response = await this.arcQuery(layerId, {
      where: "1=1",
      geometry: { x: lon, y: lat, spatialReference: { wkid: 4326 } },
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      distance: searchMeters,
      units: "esriSRUnit_Meter",
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
    });

    const features = response.features || [];
    const best = pickContainingOrNearest(features, lon, lat);
    if (!best || outSR === 4326) return best;

    try {
      return (await this.refetchFeatureInOutSR(layerId, best, outSR)) || best;
    } catch {
      return best;
    }
  }

  async refetchFeatureInOutSR(layerId, feature, outSR) {
    const objectId = findObjectIdAttribute(feature?.attributes || {});
    if (!objectId) return null;

    const value = Number(objectId.value);
    const whereValue = Number.isFinite(value)
      ? String(value)
      : `'${escapeSql(String(objectId.value))}'`;

    const response = await this.arcQuery(layerId, {
      where: `${objectId.field} = ${whereValue}`,
      outFields: "*",
      returnGeometry: true,
      outSR,
    });
    return (response.features || [])[0] || null;
  }

  async loadSubdivisionAtPoint(lon, lat, outSR = 4326, searchMeters = 2500) {
    return this.findContainingPolygonWithOutSr(this.config.layers.subdivisions, lon, lat, outSR, searchMeters);
  }

  async loadSectionAtPoint(lon, lat) {
    const url = arcgisQueryUrl(this.config.blmFirstDivisionLayer, {
      where: "1=1",
      geometry: { x: lon, y: lat, spatialReference: { wkid: 4326 } },
      geometryType: "esriGeometryPoint",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
    });

    const fs = await this.fetchJson(url);
    if (!fs?.features?.length) return null;
    return fs.features[0];
  }

  async loadAliquotsInSection(sectionFeature, outSR = 4326) {
    const rings = sectionFeature?.geometry?.rings;
    if (!rings?.length) throw new Error("Section geometry missing rings.");

    const url = arcgisQueryUrl(this.config.blmSecondDivisionLayer, {
      where: "1=1",
      geometry: { rings, spatialReference: { wkid: 4326 } },
      geometryType: "esriGeometryPolygon",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: true,
      outSR,
    });

    const fs = await this.fetchJson(url);
    return fs.features || [];
  }

  async lookupByAddress(address) {
    let addressFeature = null;
    try {
      addressFeature = await this.findBestAddressFeature(address);
    } catch {
      addressFeature = null;
    }
    let geocode = null;
    try {
      geocode = await this.geocodeAddress(address);
    } catch {
      geocode = null;
    }

    const lon = addressFeature?.geometry?.x ?? geocode?.lon;
    const lat = addressFeature?.geometry?.y ?? geocode?.lat;

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error("Unable to locate this address from county records or geocoder.");
    }

    const parcel = await this.findParcelNearPoint(lon, lat);
    if (!parcel) {
      return { geocode, addressFeature, location: { lon, lat }, parcel: null };
    }

    const section = await this.findContainingPolygon(this.config.layers.sections, lon, lat, 2500);
    const township = await this.findContainingPolygon(this.config.layers.townships, lon, lat, 2500);
    const subdivision = await this.findContainingPolygon(this.config.layers.subdivisions, lon, lat, 2500);
    const ros = await this.findRosNearPoint(lon, lat, 1600);

    let utilities = [];
    try {
      utilities = await this.lookupUtilitiesByAddress(address, 2243);
    } catch {
      utilities = [];
    }

    return {
      geocode,
      addressFeature,
      location: { lon, lat },
      parcel,
      section,
      township,
      subdivision,
      ros,
      utilities,
    };
  }
}

export default SurveyCadClient;
