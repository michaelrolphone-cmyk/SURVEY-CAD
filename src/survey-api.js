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
};

const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

function normalizeSpaces(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

export function parseAddress(rawAddress) {
  const raw = normalizeSpaces(rawAddress);
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const streetPart = (parts[0] || "").toUpperCase();
  const cityPart = parts[1] || "";

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

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
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

  async arcQuery(layerId, params) {
    const layerUrl = `${this.config.adaMapServer}/${layerId}`;
    const url = arcgisQueryUrl(layerUrl, params);
    return this.fetchJson(url);
  }

  async findBestAddressFeature(rawAddress) {
    const parsed = parseAddress(rawAddress);
    const where = buildAddressWhere(parsed);
    const response = await this.arcQuery(this.config.layers.address, {
      where,
      outFields: "*",
      returnGeometry: true,
      outSR: 4326,
    });

    const features = response.features || [];
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
      outSR,
    });
    return (response.features || [])[0] || null;
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
    const addressFeature = await this.findBestAddressFeature(address);
    let geocode = null;

    if (!addressFeature) {
      geocode = await this.geocodeAddress(address);
    } else {
      try {
        geocode = await this.geocodeAddress(address);
      } catch {
        geocode = null;
      }
    }

    const lon = addressFeature?.geometry?.x ?? geocode?.lon;
    const lat = addressFeature?.geometry?.y ?? geocode?.lat;

    const parcel = await this.findParcelNearPoint(lon, lat);
    if (!parcel) {
      return { geocode, addressFeature, location: { lon, lat }, parcel: null };
    }

    const section = await this.findContainingPolygon(this.config.layers.sections, lon, lat, 2500);
    const township = await this.findContainingPolygon(this.config.layers.townships, lon, lat, 2500);
    const subdivision = await this.findContainingPolygon(this.config.layers.subdivisions, lon, lat, 2500);
    const ros = await this.findRosNearPoint(lon, lat, 1600);

    return {
      geocode,
      addressFeature,
      location: { lon, lat },
      parcel,
      section,
      township,
      subdivision,
      ros,
    };
  }
}

export default SurveyCadClient;
