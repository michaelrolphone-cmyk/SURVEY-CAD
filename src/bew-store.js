// bew-store.js
import { randomUUID } from "node:crypto";

/* ------------------------------ errors ------------------------------ */

export class HttpError extends Error {
  constructor(status, message, code = "error", details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || undefined;
  }
}

/* ------------------------------ helpers ------------------------------ */

function nowIso() {
  return new Date().toISOString();
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.floor(n);
  if (min != null && i < min) return min;
  if (max != null && i > max) return max;
  return i;
}

function normalizeSort(sort) {
  const s = String(sort || "").trim();
  const allowed = new Set([
    "updatedAt_desc",
    "updatedAt_asc",
    "createdAt_desc",
    "createdAt_asc",
    "name_asc",
    "name_desc",
  ]);
  return allowed.has(s) ? s : "updatedAt_desc";
}

function normalizeEvidenceType(t) {
  // spec enum:
  const allowed = new Set(["Deed", "Plat", "ROS", "Corner Record", "Field Notes", "Photo", "PDF", "Other"]);
  const v = String(t || "").trim();
  return allowed.has(v) ? v : null;
}

function normalizeCornerStatus(s) {
  const allowed = new Set(["Existent", "Obliterated", "Lost", "Unknown"]);
  const v = String(s || "").trim();
  return allowed.has(v) ? v : null;
}

function normalizeCandidateKind(k) {
  const allowed = new Set(["Monument", "Record Call", "Occupation", "Computed", "Other"]);
  const v = String(k || "").trim();
  return allowed.has(v) ? v : null;
}

function toScoreFromIso(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

function safeJsonParse(s) {
  if (s == null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isUuidLike(s) {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/* ------------------------------ bearing/traverse ------------------------------ */

// Accepts:
// - N 45°01'07" E
// - N 45-01-07 E
// - N 45 01 07 E
// - N45°01' E
// - N 45 E
// Returns { ok, azimuthDeg, bearingDisplay, err }
export function quadrantBearingToAzimuthDeg(bearingText) {
  const raw = String(bearingText || "").trim();
  if (!raw) return { ok: false, err: "Empty bearingText." };

  // Normalize degree/min/sec symbols & separators
  // Capture: NS, deg, min, sec, EW
  const re = /^\s*([NS])\s*(\d{1,3})(?:\s*(?:°|deg|d|\-|\s)\s*(\d{1,2}))?(?:\s*(?:'|’|m|\-|\s)\s*(\d{1,2}))?\s*(?:(?:"|”|s)\s*)?\s*([EW])\s*$/i;
  const m = raw.replace(/\u00B0/g, "°").match(re);
  if (!m) return { ok: false, err: `Unrecognized quadrant bearing: "${raw}"` };

  const NS = m[1].toUpperCase();
  const EW = m[5].toUpperCase();
  const deg = Number(m[2]);
  const min = m[3] == null ? 0 : Number(m[3]);
  const sec = m[4] == null ? 0 : Number(m[4]);

  if (![deg, min, sec].every((n) => Number.isFinite(n))) {
    return { ok: false, err: `Invalid DMS numbers: "${raw}"` };
  }
  if (deg < 0 || deg > 90) return { ok: false, err: `Degrees out of range (0..90): "${raw}"` };
  if (min < 0 || min >= 60) return { ok: false, err: `Minutes out of range (0..59): "${raw}"` };
  if (sec < 0 || sec >= 60) return { ok: false, err: `Seconds out of range (0..59): "${raw}"` };

  const angle = deg + min / 60 + sec / 3600; // angle from N/S toward E/W in that quadrant
  let az;

  // Azimuth measured clockwise from North:
  // N..E => az = angle
  // N..W => az = 360 - angle
  // S..E => az = 180 - angle
  // S..W => az = 180 + angle
  if (NS === "N" && EW === "E") az = angle;
  else if (NS === "N" && EW === "W") az = 360 - angle;
  else if (NS === "S" && EW === "E") az = 180 - angle;
  else az = 180 + angle;

  const bearingDisplay = `${NS} ${deg}°${String(min).padStart(2, "0")}'${String(sec).padStart(2, "0")}" ${EW}`;
  return { ok: true, azimuthDeg: az, bearingDisplay };
}

function normalizeAzimuthDeg(deg) {
  let d = Number(deg);
  if (!Number.isFinite(d)) return null;
  d = d % 360;
  if (d < 0) d += 360;
  return d;
}

export function runTraverseCompute({ casefileId, start, rotationDeg, calls }) {
  const computedAt = nowIso();
  const rot = Number(rotationDeg || 0);
  if (!start || !Number.isFinite(Number(start.N)) || !Number.isFinite(Number(start.E))) {
    throw new HttpError(422, "Traverse start must include numeric N and E.", "unprocessable_entity");
  }

  const points = [];
  const segments = [];
  const warnings = [];

  let N = Number(start.N);
  let E = Number(start.E);

  points.push({ pt: 1, N, E });

  let totalDist = 0;
  let ptIndex = 1;

  for (const call of calls) {
    const label = String(call?.label || "");
    const bearingText = call?.bearingText;
    const distance = Number(call?.distance);

    if (!Number.isFinite(distance) || distance <= 0) {
      segments.push({
        ok: false,
        label: label || "CALL",
        bearing: String(bearingText || ""),
        distance: Number.isFinite(distance) ? distance : 0,
        err: "Invalid distance (must be > 0).",
        extractionId: call?.id,
      });
      warnings.push(`Skipped call ${call?.id || "(unknown)"}: invalid distance.`);
      continue;
    }

    const parsed = quadrantBearingToAzimuthDeg(bearingText);
    if (!parsed.ok) {
      segments.push({
        ok: false,
        label: label || "CALL",
        bearing: String(bearingText || ""),
        distance,
        err: parsed.err || "Invalid bearing.",
        extractionId: call?.id,
      });
      warnings.push(`Skipped call ${call?.id || "(unknown)"}: invalid bearing.`);
      continue;
    }

    const az = normalizeAzimuthDeg(parsed.azimuthDeg + rot);
    const azRad = (az * Math.PI) / 180;

    // azimuth from north clockwise:
    const dN = Math.cos(azRad) * distance;
    const dE = Math.sin(azRad) * distance;

    const from = { N, E };
    N += dN;
    E += dE;

    totalDist += distance;
    ptIndex += 1;

    points.push({ pt: ptIndex, N, E });

    segments.push({
      ok: true,
      label: label || `CALL ${ptIndex - 1}`,
      bearing: parsed.bearingDisplay,
      azimuthDeg: az,
      distance,
      dN,
      dE,
      from,
      to: { N, E },
      extractionId: call?.id,
    });
  }

  const dNclose = N - Number(start.N);
  const dEclose = E - Number(start.E);
  const misclose = Math.sqrt(dNclose * dNclose + dEclose * dEclose);
  const precision = misclose === 0 ? Infinity : totalDist / misclose;

  return {
    casefileId,
    computedAt,
    start: { N: Number(start.N), E: Number(start.E) },
    rotationDeg: rot,
    points,
    segments,
    closure: { dN: dNclose, dE: dEclose, misclose },
    totalDist,
    precision,
    warnings,
  };
}

/* ------------------------------ extraction-from-text ------------------------------ */

export function extractCallsFromTextBody(text, { defaultUnit = "ft", defaultConfidence = 0.75 } = {}) {
  const t = String(text || "");
  const created = [];
  const warnings = [];

  // Very permissive: find quadrant bearing then nearest distance to the right.
  // Example hit: 'N 45°01\'07" E 123.45'
  const re = /([NS]\s*\d{1,3}(?:\s*(?:°|deg|d|\-|\s)\s*\d{1,2})?(?:\s*(?:'|’|m|\-|\s)\s*\d{1,2})?\s*(?:(?:"|”|s)\s*)?\s*[EW])([^0-9]{0,20})(\d+(?:\.\d+)?)(?:\s*(ft|feet|'))?/gi;

  let m;
  let idx = 0;
  while ((m = re.exec(t)) !== null) {
    idx += 1;
    const bearingText = normalizeBearingText(m[1]);
    const dist = Number(m[3]);
    if (!Number.isFinite(dist) || dist <= 0) {
      warnings.push(`Match ${idx}: invalid distance "${m[3]}".`);
      continue;
    }
    created.push({
      bearingText,
      distance: dist,
      distanceUnit: normalizeDistanceUnit(m[4] || defaultUnit),
      confidence: Number(defaultConfidence),
      label: `CALL ${idx}`,
      snippet: snippetAround(t, m.index, m[0].length),
    });
  }

  if (!created.length) warnings.push("No quadrant-bearing + distance patterns found.");

  return { created, warnings };
}

function normalizeBearingText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\u00B0/g, "°")
    .trim()
    .toUpperCase();
}

function normalizeDistanceUnit(u) {
  const v = String(u || "").trim().toLowerCase();
  if (v === "feet" || v === "ft" || v === "'") return "ft";
  return "ft";
}

function snippetAround(text, startIndex, matchLen) {
  const left = Math.max(0, startIndex - 40);
  const right = Math.min(text.length, startIndex + matchLen + 40);
  return text.slice(left, right).replace(/\s+/g, " ").trim();
}

/* ------------------------------ RedisBewStore ------------------------------ */

export class RedisBewStore {
  constructor(redis, opts = {}) {
    if (!redis) throw new Error("Redis client required");
    this.redis = redis;
    this.prefix = opts.prefix || "bew";
    this.attachmentMaxBytes = clampInt(opts.attachmentMaxBytes, 25 * 1024 * 1024, 1, 250 * 1024 * 1024);
  }

  /* ---------- key helpers ---------- */

  k(...parts) {
    return [this.prefix, ...parts].join(":");
  }

  kCasefile(id) { return this.k("casefile", id); }
  kCasefilesUpdated() { return this.k("casefiles", "updatedAt"); }
  kCasefilesCreated() { return this.k("casefiles", "createdAt"); }
  kCasefilesSet() { return this.k("casefiles", "all"); }

  kEvidence(id) { return this.k("evidence", id); }
  kEvidenceIndex(casefileId) { return this.k("casefile", casefileId, "evidence", "createdAt"); }

  kExtraction(id) { return this.k("extraction", id); }
  kExtractionIndex(casefileId) { return this.k("casefile", casefileId, "extractions", "order"); }

  kCorner(id) { return this.k("corner", id); }
  kCornerIndex(casefileId) { return this.k("casefile", casefileId, "corners", "createdAt"); }

  kDecision(id) { return this.k("decision", id); }
  kDecisionIndex(casefileId) { return this.k("casefile", casefileId, "decisions", "at"); }

  kTraverseResults(casefileId) { return this.k("casefile", casefileId, "traverse", "results"); }

  kAttachmentMeta(evidenceId) { return this.k("evidence", evidenceId, "attachment", "meta"); }
  kAttachmentBin(evidenceId) { return this.k("evidence", evidenceId, "attachment", "bin"); }

  /* ---------- low-level JSON ---------- */

  async getJson(key) {
    const s = await this.redis.get(key);
    return safeJsonParse(s);
  }

  async setJson(key, obj) {
    await this.redis.set(key, JSON.stringify(obj));
  }

  async delKeys(keys) {
    if (!keys.length) return 0;
    return this.redis.del(keys);
  }

  /* ---------- existence ---------- */

  async requireCasefile(casefileId) {
    const cf = await this.getJson(this.kCasefile(casefileId));
    if (!cf) throw new HttpError(404, "Casefile not found.", "not_found");
    return cf;
  }

  async requireEvidence(casefileId, evidenceId) {
    await this.requireCasefile(casefileId);
    const ev = await this.getJson(this.kEvidence(evidenceId));
    if (!ev || ev.casefileId !== casefileId) throw new HttpError(404, "Evidence not found.", "not_found");
    return ev;
  }

  async requireExtraction(casefileId, extractionId) {
    await this.requireCasefile(casefileId);
    const ex = await this.getJson(this.kExtraction(extractionId));
    if (!ex || ex.casefileId !== casefileId) throw new HttpError(404, "Extraction not found.", "not_found");
    return ex;
  }

  async requireCorner(casefileId, cornerId) {
    await this.requireCasefile(casefileId);
    const c = await this.getJson(this.kCorner(cornerId));
    if (!c || c.casefileId !== casefileId) throw new HttpError(404, "Corner not found.", "not_found");
    return c;
  }

  /* ------------------------------ casefiles ------------------------------ */

  async listCasefiles({ limit, offset, q, sort } = {}) {
    const lim = clampInt(limit, 50, 1, 500);
    const off = clampInt(offset, 0, 0, 1_000_000);
    const s = normalizeSort(sort);
    const query = String(q || "").trim().toLowerCase();

    let ids = [];

    if (s === "updatedAt_desc") {
      ids = await this.redis.zrevrange(this.kCasefilesUpdated(), 0, -1);
    } else if (s === "updatedAt_asc") {
      ids = await this.redis.zrange(this.kCasefilesUpdated(), 0, -1);
    } else if (s === "createdAt_desc") {
      ids = await this.redis.zrevrange(this.kCasefilesCreated(), 0, -1);
    } else if (s === "createdAt_asc") {
      ids = await this.redis.zrange(this.kCasefilesCreated(), 0, -1);
    } else {
      // name sorts need materialization
      ids = await this.redis.smembers(this.kCasefilesSet());
    }

    let items = [];
    if (ids.length) {
      const keys = ids.map((id) => this.kCasefile(id));
      const raw = await this.redis.mget(keys);
      items = raw.map(safeJsonParse).filter(Boolean);
    }

    if (query) {
      items = items.filter((cf) => {
        const hay = [
          cf?.meta?.name,
          cf?.meta?.jurisdiction,
          cf?.meta?.notes,
        ].map((x) => String(x || "").toLowerCase()).join(" | ");
        return hay.includes(query);
      });
    }

    if (s === "name_asc" || s === "name_desc") {
      items.sort((a, b) => {
        const an = String(a?.meta?.name || "").toLowerCase();
        const bn = String(b?.meta?.name || "").toLowerCase();
        if (an < bn) return s === "name_asc" ? -1 : 1;
        if (an > bn) return s === "name_asc" ? 1 : -1;
        return 0;
      });
    }

    // for other sorts already via index order; but after filter we keep current order.
    const total = items.length;
    const page = items.slice(off, off + lim);

    return { items: page, limit: lim, offset: off, total };
  }

  async createCasefile(body = {}) {
    const name = String(body?.name || "").trim();
    if (!name) throw new HttpError(400, "name is required.", "bad_request");

    const id = randomUUID();
    const createdAt = nowIso();
    const updatedAt = createdAt;

    const jurisdiction = String(body?.jurisdiction ?? "Idaho");
    const notes = String(body?.notes ?? "");
    const initDefaults = body?.initializeDefaults !== false;

    const traverse = initDefaults
      ? { start: { N: 10000, E: 10000 }, basis: { label: "BASIS", rotationDeg: 0 }, calls: [], lastRun: null }
      : { start: { N: 0, E: 0 }, basis: { label: "BASIS", rotationDeg: 0 }, calls: [], lastRun: null };

    const casefile = {
      id,
      meta: { name, jurisdiction, notes, createdAt, updatedAt },
      counts: { evidence: 0, extractions: 0, corners: 0, decisions: 0 },
      traverse,
    };

    const updatedScore = toScoreFromIso(updatedAt);
    const createdScore = toScoreFromIso(createdAt);

    const multi = this.redis.multi();
    multi.set(this.kCasefile(id), JSON.stringify(casefile));
    multi.sadd(this.kCasefilesSet(), id);
    multi.zadd(this.kCasefilesUpdated(), updatedScore, id);
    multi.zadd(this.kCasefilesCreated(), createdScore, id);
    await multi.exec();

    // initialize indexes (empty zsets) are created on first zadd; no-op here.

    return casefile;
  }

  async getCasefile(casefileId) {
    const cf = await this.getJson(this.kCasefile(casefileId));
    if (!cf) throw new HttpError(404, "Casefile not found.", "not_found");
    return cf;
  }

  async updateCasefile(casefileId, patch = {}) {
    const cf = await this.requireCasefile(casefileId);

    const metaPatch = patch?.meta && typeof patch.meta === "object" ? patch.meta : {};
    const next = structuredClone(cf);

    if (metaPatch.name != null) {
      const n = String(metaPatch.name).trim();
      if (!n) throw new HttpError(400, "meta.name cannot be empty.", "bad_request");
      next.meta.name = n;
    }
    if (metaPatch.jurisdiction != null) next.meta.jurisdiction = String(metaPatch.jurisdiction);
    if (metaPatch.notes != null) next.meta.notes = String(metaPatch.notes);

    next.meta.updatedAt = nowIso();

    const multi = this.redis.multi();
    multi.set(this.kCasefile(casefileId), JSON.stringify(next));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(next.meta.updatedAt), casefileId);
    await multi.exec();

    return next;
  }

  async deleteCasefile(casefileId) {
    // Deep delete everything for this casefile (recommended to avoid orphaned keys)
    const cf = await this.requireCasefile(casefileId);

    const [evidenceIds, extractionIds, cornerIds, decisionIds] = await Promise.all([
      this.redis.zrange(this.kEvidenceIndex(casefileId), 0, -1),
      this.redis.zrange(this.kExtractionIndex(casefileId), 0, -1),
      this.redis.zrange(this.kCornerIndex(casefileId), 0, -1),
      this.redis.zrange(this.kDecisionIndex(casefileId), 0, -1),
    ]);

    const keys = [];
    keys.push(this.kCasefile(casefileId));
    keys.push(this.kEvidenceIndex(casefileId));
    keys.push(this.kExtractionIndex(casefileId));
    keys.push(this.kCornerIndex(casefileId));
    keys.push(this.kDecisionIndex(casefileId));
    keys.push(this.kTraverseResults(casefileId));

    for (const id of evidenceIds) {
      keys.push(this.kEvidence(id));
      keys.push(this.kAttachmentMeta(id));
      keys.push(this.kAttachmentBin(id));
    }
    for (const id of extractionIds) keys.push(this.kExtraction(id));
    for (const id of cornerIds) keys.push(this.kCorner(id));
    for (const id of decisionIds) keys.push(this.kDecision(id));

    const multi = this.redis.multi();
    multi.del(...keys);
    multi.srem(this.kCasefilesSet(), casefileId);
    multi.zrem(this.kCasefilesUpdated(), casefileId);
    multi.zrem(this.kCasefilesCreated(), casefileId);
    await multi.exec();

    return { deleted: true, id: cf.id };
  }

  async duplicateCasefile(casefileId, body = {}) {
    const src = await this.requireCasefile(casefileId);

    const bundle = await this.exportCasefileBundle(casefileId);
    const overrideName = body?.name != null ? String(body.name).trim() : "";
    if (overrideName) bundle.meta.name = overrideName;

    // Import with rewriteIds ALWAYS for duplication
    return this.importCasefileBundle({ bundle }, { rewriteIds: true });
  }

  async exportCasefileBundle(casefileId) {
    const cf = await this.requireCasefile(casefileId);

    const [evidenceIds, extractionIds, cornerIds, decisionIds, traverseEnvelope] = await Promise.all([
      this.redis.zrange(this.kEvidenceIndex(casefileId), 0, -1),
      this.redis.zrange(this.kExtractionIndex(casefileId), 0, -1),
      this.redis.zrange(this.kCornerIndex(casefileId), 0, -1),
      this.redis.zrange(this.kDecisionIndex(casefileId), 0, -1),
      this.getTraverseResults(casefileId).catch(() => ({ lastRun: null, results: null })),
    ]);

    const [evidence, extractions, corners, decisions] = await Promise.all([
      this._mgetJson(evidenceIds.map((id) => this.kEvidence(id))),
      this._mgetJson(extractionIds.map((id) => this.kExtraction(id))),
      this._mgetJson(cornerIds.map((id) => this.kCorner(id))),
      this._mgetJson(decisionIds.map((id) => this.kDecision(id))),
    ]);

    const bundle = {
      id: cf.id,
      meta: cf.meta,
      evidence: evidence.filter(Boolean),
      extractions: extractions.filter(Boolean),
      corners: corners.filter(Boolean),
      traverse: {
        start: cf.traverse.start,
        basis: cf.traverse.basis,
        calls: cf.traverse.calls,
        lastRun: traverseEnvelope.lastRun,
        results: traverseEnvelope.results,
      },
      decisions: decisions.filter(Boolean),
      __exportedAt: nowIso(),
      __tool: "bew",
    };

    return bundle;
  }

  async importCasefileBundle(reqBody = {}, options = {}) {
    const bundle = reqBody?.bundle;
    if (!bundle || typeof bundle !== "object") {
      throw new HttpError(400, "bundle is required.", "bad_request");
    }
    const rewriteIds = options?.rewriteIds ?? (reqBody?.rewriteIds !== false);

    // Build ID map
    const idMap = new Map();
    const newCasefileId = rewriteIds ? randomUUID() : String(bundle.id || randomUUID());

    function mapId(oldId) {
      const o = String(oldId || "");
      if (!rewriteIds) return o;
      if (!o) return randomUUID();
      if (!idMap.has(o)) idMap.set(o, randomUUID());
      return idMap.get(o);
    }

    const createdAt = nowIso();
    const meta = {
      name: String(bundle?.meta?.name || "Imported Casefile").trim() || "Imported Casefile",
      jurisdiction: String(bundle?.meta?.jurisdiction || "Idaho"),
      notes: String(bundle?.meta?.notes || ""),
      createdAt,
      updatedAt: createdAt,
    };

    const evidence = Array.isArray(bundle.evidence) ? bundle.evidence : [];
    const extractions = Array.isArray(bundle.extractions) ? bundle.extractions : [];
    const corners = Array.isArray(bundle.corners) ? bundle.corners : [];
    const decisions = Array.isArray(bundle.decisions) ? bundle.decisions : [];

    const traverseStart = bundle?.traverse?.start || { N: 10000, E: 10000 };
    const traverseBasis = bundle?.traverse?.basis || { label: "BASIS", rotationDeg: 0 };
    const traverseCalls = Array.isArray(bundle?.traverse?.calls) ? bundle.traverse.calls : [];

    const mappedEvidence = evidence.map((ev) => {
      const id = mapId(ev.id);
      return {
        ...ev,
        id,
        casefileId: newCasefileId,
        createdAt: createdAt,
        updatedAt: createdAt,
        attachment: null, // attachments are not imported by default (binary not in spec bundle)
      };
    });

    const mappedExtractions = extractions.map((ex, idx) => {
      const id = mapId(ex.id);
      return {
        ...ex,
        id,
        casefileId: newCasefileId,
        evidenceId: ex.evidenceId ? mapId(ex.evidenceId) : (mappedEvidence[0]?.id || randomUUID()),
        createdAt: createdAt,
        orderIndex: Number.isFinite(Number(ex.orderIndex)) ? Number(ex.orderIndex) : idx,
      };
    });

    const mappedCorners = corners.map((c) => {
      const id = mapId(c.id);
      const candidates = Array.isArray(c.candidates) ? c.candidates : [];
      return {
        ...c,
        id,
        casefileId: newCasefileId,
        createdAt: createdAt,
        updatedAt: createdAt,
        candidates: candidates.map((cand) => ({
          ...cand,
          id: mapId(cand.id),
          cornerId: id,
          refEvidenceId: cand.refEvidenceId ? mapId(cand.refEvidenceId) : null,
        })),
      };
    });

    const mappedDecisions = decisions.map((d) => ({
      ...d,
      id: mapId(d.id),
      casefileId: newCasefileId,
      cornerId: d.cornerId ? mapId(d.cornerId) : null,
      at: d.at || createdAt,
    }));

    const traverse = {
      start: { N: Number(traverseStart.N), E: Number(traverseStart.E) },
      basis: { label: String(traverseBasis.label || "BASIS"), rotationDeg: Number(traverseBasis.rotationDeg || 0) },
      calls: traverseCalls.map(mapId).filter(isUuidLike),
      lastRun: null,
    };

    const casefile = {
      id: newCasefileId,
      meta,
      counts: {
        evidence: mappedEvidence.length,
        extractions: mappedExtractions.length,
        corners: mappedCorners.length,
        decisions: mappedDecisions.length,
      },
      traverse,
    };

    // Persist all
    const multi = this.redis.multi();

    // casefile
    multi.set(this.kCasefile(newCasefileId), JSON.stringify(casefile));
    multi.sadd(this.kCasefilesSet(), newCasefileId);
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(meta.updatedAt), newCasefileId);
    multi.zadd(this.kCasefilesCreated(), toScoreFromIso(meta.createdAt), newCasefileId);

    // indexes
    mappedEvidence.forEach((ev) => {
      multi.set(this.kEvidence(ev.id), JSON.stringify(ev));
      multi.zadd(this.kEvidenceIndex(newCasefileId), toScoreFromIso(ev.createdAt), ev.id);
    });

    mappedExtractions.forEach((ex) => {
      multi.set(this.kExtraction(ex.id), JSON.stringify(ex));
      // orderIndex determines order
      multi.zadd(this.kExtractionIndex(newCasefileId), Number(ex.orderIndex || 0), ex.id);
    });

    mappedCorners.forEach((c) => {
      multi.set(this.kCorner(c.id), JSON.stringify(c));
      multi.zadd(this.kCornerIndex(newCasefileId), toScoreFromIso(c.createdAt), c.id);
    });

    mappedDecisions.forEach((d) => {
      multi.set(this.kDecision(d.id), JSON.stringify(d));
      multi.zadd(this.kDecisionIndex(newCasefileId), toScoreFromIso(d.at), d.id);
    });

    // optional traverse results import (if present and rewriteIds)
    const results = bundle?.traverse?.results;
    if (results && typeof results === "object") {
      const mappedResults = structuredClone(results);
      mappedResults.casefileId = newCasefileId;
      if (Array.isArray(mappedResults.segments)) {
        mappedResults.segments.forEach((seg) => {
          if (seg?.extractionId) seg.extractionId = mapId(seg.extractionId);
        });
      }
      multi.set(
        this.kTraverseResults(newCasefileId),
        JSON.stringify({ lastRun: nowIso(), results: mappedResults })
      );
      // reflect lastRun
      casefile.traverse.lastRun = nowIso();
      multi.set(this.kCasefile(newCasefileId), JSON.stringify(casefile));
      multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(casefile.meta.updatedAt), newCasefileId);
    } else {
      multi.set(this.kTraverseResults(newCasefileId), JSON.stringify({ lastRun: null, results: null }));
    }

    await multi.exec();

    // Return bundle response per spec for import endpoint: CasefileBundle
    return this.exportCasefileBundle(newCasefileId);
  }

  async _mgetJson(keys) {
    if (!keys.length) return [];
    const raw = await this.redis.mget(keys);
    return raw.map(safeJsonParse);
  }

  /* ------------------------------ evidence ------------------------------ */

  async listEvidence(casefileId, { limit, offset, type, tag } = {}) {
    await this.requireCasefile(casefileId);

    const lim = clampInt(limit, 50, 1, 500);
    const off = clampInt(offset, 0, 0, 1_000_000);

    const ids = await this.redis.zrange(this.kEvidenceIndex(casefileId), 0, -1);
    const evidence = (await this._mgetJson(ids.map((id) => this.kEvidence(id)))).filter(Boolean);

    let filtered = evidence;
    if (type != null) {
      const t = String(type || "");
      filtered = filtered.filter((e) => String(e.type) === t);
    }
    if (tag != null) {
      const tg = String(tag || "");
      filtered = filtered.filter((e) => Array.isArray(e.tags) && e.tags.includes(tg));
    }

    return { items: filtered.slice(off, off + lim), limit: lim, offset: off, total: filtered.length };
  }

  async createEvidence(casefileId, body = {}) {
    const cf = await this.requireCasefile(casefileId);

    const type = normalizeEvidenceType(body?.type);
    if (!type) throw new HttpError(400, "Invalid evidence type.", "bad_request");

    const title = String(body?.title || "").trim();
    if (!title) throw new HttpError(400, "title is required.", "bad_request");

    const id = randomUUID();
    const createdAt = nowIso();
    const updatedAt = createdAt;

    const evidence = {
      id,
      casefileId,
      type,
      title,
      date: body?.date ?? null,
      source: String(body?.source ?? ""),
      tags: Array.isArray(body?.tags) ? body.tags.map((t) => String(t)) : [],
      notes: String(body?.notes ?? ""),
      attachment: null,
      createdAt,
      updatedAt,
    };

    // update casefile counts
    cf.counts.evidence += 1;
    cf.meta.updatedAt = updatedAt;

    const multi = this.redis.multi();
    multi.set(this.kEvidence(id), JSON.stringify(evidence));
    multi.zadd(this.kEvidenceIndex(casefileId), toScoreFromIso(createdAt), id);
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return evidence;
  }

  async getEvidence(casefileId, evidenceId) {
    return this.requireEvidence(casefileId, evidenceId);
  }

  async updateEvidence(casefileId, evidenceId, patch = {}) {
    const cf = await this.requireCasefile(casefileId);
    const ev = await this.requireEvidence(casefileId, evidenceId);

    const next = structuredClone(ev);

    if (patch.type != null) {
      const type = normalizeEvidenceType(patch.type);
      if (!type) throw new HttpError(400, "Invalid evidence type.", "bad_request");
      next.type = type;
    }
    if (patch.title != null) {
      const title = String(patch.title || "").trim();
      if (!title) throw new HttpError(400, "title cannot be empty.", "bad_request");
      next.title = title;
    }
    if (patch.date !== undefined) next.date = patch.date;
    if (patch.source != null) next.source = String(patch.source);
    if (patch.tags != null) next.tags = Array.isArray(patch.tags) ? patch.tags.map((t) => String(t)) : [];
    if (patch.notes != null) next.notes = String(patch.notes);

    if (patch.attachmentName != null) {
      const attachmentName = String(patch.attachmentName || "").trim();
      if (!attachmentName) throw new HttpError(400, "attachmentName cannot be empty.", "bad_request");
      if (!next.attachment) throw new HttpError(400, "Evidence has no attachment to rename.", "bad_request");

      const previousAttachmentName = String(next.attachment.name || "");
      next.attachment.name = attachmentName;

      // Keep user-facing references in sync when they still mirror the attachment filename.
      if (String(next.title || "") === previousAttachmentName) {
        next.title = attachmentName;
      }
      if (String(next.source || "") === previousAttachmentName) {
        next.source = attachmentName;
      }
    }

    next.updatedAt = nowIso();
    cf.meta.updatedAt = next.updatedAt;

    const multi = this.redis.multi();
    if (patch.attachmentName != null) {
      multi.set(this.kAttachmentMeta(evidenceId), JSON.stringify(next.attachment));
    }
    multi.set(this.kEvidence(evidenceId), JSON.stringify(next));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return next;
  }

  async deleteEvidence(casefileId, evidenceId) {
    const cf = await this.requireCasefile(casefileId);
    await this.requireEvidence(casefileId, evidenceId);

    cf.counts.evidence = Math.max(0, cf.counts.evidence - 1);
    cf.meta.updatedAt = nowIso();

    const multi = this.redis.multi();
    multi.del(this.kEvidence(evidenceId));
    multi.zrem(this.kEvidenceIndex(casefileId), evidenceId);
    multi.del(this.kAttachmentMeta(evidenceId));
    multi.del(this.kAttachmentBin(evidenceId));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return { deleted: true };
  }

  async uploadEvidenceAttachment(casefileId, evidenceId, { filename, mime, buffer }) {
    const cf = await this.requireCasefile(casefileId);
    const ev = await this.requireEvidence(casefileId, evidenceId);

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new HttpError(400, "file is required.", "bad_request");
    }
    if (buffer.length > this.attachmentMaxBytes) {
      throw new HttpError(413, "Payload too large.", "payload_too_large", { maxBytes: this.attachmentMaxBytes });
    }

    const meta = {
      name: String(filename || "attachment.bin"),
      mime: String(mime || "application/octet-stream"),
      size: buffer.length,
      stored: true,
      url: null,
    };

    const nextEvidence = structuredClone(ev);
    nextEvidence.attachment = meta;
    nextEvidence.updatedAt = nowIso();
    cf.meta.updatedAt = nextEvidence.updatedAt;

    // store binary in redis as base64 (portable)
    const binB64 = buffer.toString("base64");

    const multi = this.redis.multi();
    multi.set(this.kAttachmentMeta(evidenceId), JSON.stringify(meta));
    multi.set(this.kAttachmentBin(evidenceId), binB64);
    multi.set(this.kEvidence(evidenceId), JSON.stringify(nextEvidence));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return nextEvidence;
  }

  async downloadEvidenceAttachment(casefileId, evidenceId) {
    await this.requireEvidence(casefileId, evidenceId);

    const meta = await this.getJson(this.kAttachmentMeta(evidenceId));
    const bin = await this.redis.get(this.kAttachmentBin(evidenceId));
    if (!meta || !bin) throw new HttpError(404, "Attachment not found.", "not_found");

    const buffer = Buffer.from(bin, "base64");
    return { meta, buffer };
  }

  async deleteEvidenceAttachment(casefileId, evidenceId) {
    const cf = await this.requireCasefile(casefileId);
    const ev = await this.requireEvidence(casefileId, evidenceId);

    const nextEvidence = structuredClone(ev);
    nextEvidence.attachment = null;
    nextEvidence.updatedAt = nowIso();
    cf.meta.updatedAt = nextEvidence.updatedAt;

    const multi = this.redis.multi();
    multi.del(this.kAttachmentMeta(evidenceId));
    multi.del(this.kAttachmentBin(evidenceId));
    multi.set(this.kEvidence(evidenceId), JSON.stringify(nextEvidence));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return { deleted: true };
  }

  /* ------------------------------ extractions ------------------------------ */

  async listExtractions(casefileId, { limit, offset, include, evidenceId } = {}) {
    await this.requireCasefile(casefileId);

    const lim = clampInt(limit, 50, 1, 500);
    const off = clampInt(offset, 0, 0, 1_000_000);

    const ids = await this.redis.zrange(this.kExtractionIndex(casefileId), 0, -1);
    const rows = (await this._mgetJson(ids.map((id) => this.kExtraction(id)))).filter(Boolean);

    let filtered = rows;
    if (include !== undefined) {
      const inc = include === true || include === "true" || include === 1 || include === "1";
      filtered = filtered.filter((x) => Boolean(x.include) === inc);
    }
    if (evidenceId != null) {
      const eid = String(evidenceId);
      filtered = filtered.filter((x) => String(x.evidenceId) === eid);
    }

    return { items: filtered.slice(off, off + lim), limit: lim, offset: off, total: filtered.length };
  }

  async createExtraction(casefileId, body = {}) {
    const cf = await this.requireCasefile(casefileId);

    const evidenceId = String(body?.evidenceId || "").trim();
    if (!isUuidLike(evidenceId)) throw new HttpError(400, "evidenceId must be a uuid.", "bad_request");
    // evidence may be deleted (spec allows dangling refs), but for create we enforce it exists:
    await this.requireEvidence(casefileId, evidenceId);

    const bearingText = String(body?.bearingText || "").trim();
    const distance = Number(body?.distance);
    if (!bearingText) throw new HttpError(400, "bearingText is required.", "bad_request");
    if (!Number.isFinite(distance) || distance <= 0) throw new HttpError(400, "distance must be > 0.", "bad_request");

    const id = randomUUID();
    const createdAt = nowIso();

    const page = clampInt(body?.page, 1, 1, 1_000_000);
    const snippet = String(body?.snippet ?? "(manual entry)");
    const label = String(body?.label ?? "");
    const distanceUnit = String(body?.distanceUnit ?? "ft");
    const include = body?.include !== false;
    const confidence = Number.isFinite(Number(body?.confidence)) ? Number(body.confidence) : 0.9;

    // determine orderIndex as append to end
    const max = await this.redis.zrevrange(this.kExtractionIndex(casefileId), 0, 0, "WITHSCORES");
    const lastScore = max?.length >= 2 ? Number(max[1]) : -1;
    const orderIndex = Number.isFinite(lastScore) ? lastScore + 1 : 0;

    const extraction = {
      id,
      casefileId,
      createdAt,
      evidenceId,
      page,
      snippet,
      label,
      bearingText,
      distance,
      distanceUnit,
      include,
      confidence,
      orderIndex: Math.floor(orderIndex),
    };

    cf.counts.extractions += 1;
    cf.meta.updatedAt = createdAt;

    const multi = this.redis.multi();
    multi.set(this.kExtraction(id), JSON.stringify(extraction));
    multi.zadd(this.kExtractionIndex(casefileId), extraction.orderIndex, id);
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return extraction;
  }

  async extractFromText(casefileId, body = {}) {
    const cf = await this.requireCasefile(casefileId);

    const evidenceId = String(body?.evidenceId || "").trim();
    if (!isUuidLike(evidenceId)) throw new HttpError(400, "evidenceId must be a uuid.", "bad_request");
    await this.requireEvidence(casefileId, evidenceId);

    const text = String(body?.text || "");
    if (!text.trim()) throw new HttpError(400, "text is required.", "bad_request");

    const page = clampInt(body?.page, 1, 1, 1_000_000);
    const defaultUnit = String(body?.defaultUnit || "ft");
    const defaultConfidence = Number.isFinite(Number(body?.defaultConfidence)) ? Number(body.defaultConfidence) : 0.75;
    const includeByDefault = body?.includeByDefault !== false;

    const { created, warnings } = extractCallsFromTextBody(text, { defaultUnit, defaultConfidence });

    // Append extractions in current order
    const max = await this.redis.zrevrange(this.kExtractionIndex(casefileId), 0, 0, "WITHSCORES");
    const lastScore = max?.length >= 2 ? Number(max[1]) : -1;
    let nextOrder = Number.isFinite(lastScore) ? Math.floor(lastScore) + 1 : 0;

    const toPersist = created.map((c) => {
      const id = randomUUID();
      const ex = {
        id,
        casefileId,
        createdAt: nowIso(),
        evidenceId,
        page,
        snippet: c.snippet || "",
        label: c.label || "",
        bearingText: c.bearingText,
        distance: c.distance,
        distanceUnit: c.distanceUnit || "ft",
        include: includeByDefault,
        confidence: c.confidence ?? defaultConfidence,
        orderIndex: nextOrder++,
      };
      return ex;
    });

    cf.counts.extractions += toPersist.length;
    cf.meta.updatedAt = nowIso();

    const multi = this.redis.multi();
    toPersist.forEach((ex) => {
      multi.set(this.kExtraction(ex.id), JSON.stringify(ex));
      multi.zadd(this.kExtractionIndex(casefileId), ex.orderIndex, ex.id);
    });
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return { created: toPersist, warnings };
  }

  async reorderExtractions(casefileId, body = {}) {
    const cf = await this.requireCasefile(casefileId);

    const ids = Array.isArray(body?.ids) ? body.ids.map((x) => String(x)) : null;
    if (!ids) throw new HttpError(400, "ids array is required.", "bad_request");

    // Ensure all exist and belong to casefile
    const rows = await this._mgetJson(ids.map((id) => this.kExtraction(id)));
    for (let i = 0; i < ids.length; i += 1) {
      const ex = rows[i];
      if (!ex || ex.casefileId !== casefileId) {
        throw new HttpError(400, `Extraction id not found in casefile: ${ids[i]}`, "bad_request");
      }
    }

    // Update orderIndex scores to 0..n-1
    const multi = this.redis.multi();
    ids.forEach((id, idx) => multi.zadd(this.kExtractionIndex(casefileId), idx, id));

    // Also persist orderIndex in each extraction object
    ids.forEach((id, idx) => {
      const ex = rows[idx];
      ex.orderIndex = idx;
      multi.set(this.kExtraction(id), JSON.stringify(ex));
    });

    cf.meta.updatedAt = nowIso();
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);

    await multi.exec();

    // Return list response per spec
    return this.listExtractions(casefileId, { limit: 500, offset: 0 });
  }

  async getExtraction(casefileId, extractionId) {
    return this.requireExtraction(casefileId, extractionId);
  }

  async updateExtraction(casefileId, extractionId, patch = {}) {
    const cf = await this.requireCasefile(casefileId);
    const ex = await this.requireExtraction(casefileId, extractionId);

    const next = structuredClone(ex);

    if (patch.evidenceId != null) {
      const eid = String(patch.evidenceId).trim();
      if (!isUuidLike(eid)) throw new HttpError(400, "evidenceId must be a uuid.", "bad_request");
      // allow dangling? For update, permit if you want. Here we enforce existence.
      await this.requireEvidence(casefileId, eid);
      next.evidenceId = eid;
    }
    if (patch.page != null) next.page = clampInt(patch.page, next.page, 1, 1_000_000);
    if (patch.snippet != null) next.snippet = String(patch.snippet);
    if (patch.label != null) next.label = String(patch.label);
    if (patch.bearingText != null) next.bearingText = String(patch.bearingText);
    if (patch.distance != null) {
      const d = Number(patch.distance);
      if (!Number.isFinite(d) || d <= 0) throw new HttpError(400, "distance must be > 0.", "bad_request");
      next.distance = d;
    }
    if (patch.distanceUnit != null) next.distanceUnit = String(patch.distanceUnit);
    if (patch.include != null) next.include = Boolean(patch.include);
    if (patch.confidence != null) {
      const c = Number(patch.confidence);
      if (!Number.isFinite(c) || c < 0 || c > 1) throw new HttpError(400, "confidence must be 0..1.", "bad_request");
      next.confidence = c;
    }
    if (patch.orderIndex != null) {
      const oi = clampInt(patch.orderIndex, next.orderIndex ?? 0, 0, 1_000_000_000);
      next.orderIndex = oi;
      await this.redis.zadd(this.kExtractionIndex(casefileId), oi, extractionId);
    }

    cf.meta.updatedAt = nowIso();
    const multi = this.redis.multi();
    multi.set(this.kExtraction(extractionId), JSON.stringify(next));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return next;
  }

  async deleteExtraction(casefileId, extractionId) {
    const cf = await this.requireCasefile(casefileId);
    await this.requireExtraction(casefileId, extractionId);

    cf.counts.extractions = Math.max(0, cf.counts.extractions - 1);
    cf.meta.updatedAt = nowIso();

    const multi = this.redis.multi();
    multi.del(this.kExtraction(extractionId));
    multi.zrem(this.kExtractionIndex(casefileId), extractionId);
    // also remove from traverse.calls if present
    cf.traverse.calls = Array.isArray(cf.traverse.calls) ? cf.traverse.calls.filter((id) => id !== extractionId) : [];
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return { deleted: true };
  }

  /* ------------------------------ corners + embedded candidates ------------------------------ */

  async listCorners(casefileId, { limit, offset, status } = {}) {
    await this.requireCasefile(casefileId);

    const lim = clampInt(limit, 50, 1, 500);
    const off = clampInt(offset, 0, 0, 1_000_000);

    const ids = await this.redis.zrange(this.kCornerIndex(casefileId), 0, -1);
    const rows = (await this._mgetJson(ids.map((id) => this.kCorner(id)))).filter(Boolean);

    let filtered = rows;
    if (status != null) {
      const st = String(status);
      filtered = filtered.filter((c) => String(c.status) === st);
    }

    return { items: filtered.slice(off, off + lim), limit: lim, offset: off, total: filtered.length };
  }

  async createCorner(casefileId, body = {}) {
    const cf = await this.requireCasefile(casefileId);

    const name = String(body?.name || "").trim();
    if (!name) throw new HttpError(400, "name is required.", "bad_request");

    const status = body?.status != null ? normalizeCornerStatus(body.status) : "Unknown";
    if (!status) throw new HttpError(400, "Invalid corner status.", "bad_request");

    const id = randomUUID();
    const createdAt = nowIso();
    const updatedAt = createdAt;

    const corner = {
      id,
      casefileId,
      name,
      plss: String(body?.plss ?? ""),
      status,
      candidates: [],
      createdAt,
      updatedAt,
    };

    cf.counts.corners += 1;
    cf.meta.updatedAt = updatedAt;

    const multi = this.redis.multi();
    multi.set(this.kCorner(id), JSON.stringify(corner));
    multi.zadd(this.kCornerIndex(casefileId), toScoreFromIso(createdAt), id);
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return corner;
  }

  async getCorner(casefileId, cornerId) {
    return this.requireCorner(casefileId, cornerId);
  }

  async updateCorner(casefileId, cornerId, patch = {}) {
    const cf = await this.requireCasefile(casefileId);
    const corner = await this.requireCorner(casefileId, cornerId);

    const next = structuredClone(corner);

    if (patch.name != null) {
      const n = String(patch.name).trim();
      if (!n) throw new HttpError(400, "name cannot be empty.", "bad_request");
      next.name = n;
    }
    if (patch.plss != null) next.plss = String(patch.plss);
    if (patch.status != null) {
      const st = normalizeCornerStatus(patch.status);
      if (!st) throw new HttpError(400, "Invalid corner status.", "bad_request");
      next.status = st;
    }

    next.updatedAt = nowIso();
    cf.meta.updatedAt = next.updatedAt;

    const multi = this.redis.multi();
    multi.set(this.kCorner(cornerId), JSON.stringify(next));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return next;
  }

  async deleteCorner(casefileId, cornerId) {
    const cf = await this.requireCasefile(casefileId);
    await this.requireCorner(casefileId, cornerId);

    cf.counts.corners = Math.max(0, cf.counts.corners - 1);
    cf.meta.updatedAt = nowIso();

    const multi = this.redis.multi();
    multi.del(this.kCorner(cornerId));
    multi.zrem(this.kCornerIndex(casefileId), cornerId);
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return { deleted: true };
  }

  async listCandidates(casefileId, cornerId) {
    const corner = await this.requireCorner(casefileId, cornerId);
    return { items: Array.isArray(corner.candidates) ? corner.candidates : [] };
  }

  async createCandidate(casefileId, cornerId, body = {}) {
    const cf = await this.requireCasefile(casefileId);
    const corner = await this.requireCorner(casefileId, cornerId);

    const kind = normalizeCandidateKind(body?.kind);
    if (!kind) throw new HttpError(400, "Invalid candidate kind.", "bad_request");

    const summary = String(body?.summary || "").trim();
    if (!summary) throw new HttpError(400, "summary is required.", "bad_request");

    const weight = clampInt(body?.weight, 3, 1, 5);

    let refEvidenceId = null;
    if (body?.refEvidenceId !== undefined) {
      if (body.refEvidenceId === null) refEvidenceId = null;
      else {
        const eid = String(body.refEvidenceId).trim();
        if (!isUuidLike(eid)) throw new HttpError(400, "refEvidenceId must be a uuid or null.", "bad_request");
        // evidence may be missing; but for adding a ref, enforce evidence exists:
        await this.requireEvidence(casefileId, eid);
        refEvidenceId = eid;
      }
    }

    const cand = {
      id: randomUUID(),
      cornerId,
      kind,
      refEvidenceId,
      summary,
      weight,
      chosen: false,
      justification: "",
    };

    const nextCorner = structuredClone(corner);
    nextCorner.candidates = Array.isArray(nextCorner.candidates) ? nextCorner.candidates : [];
    nextCorner.candidates.push(cand);
    nextCorner.updatedAt = nowIso();

    cf.meta.updatedAt = nextCorner.updatedAt;

    const multi = this.redis.multi();
    multi.set(this.kCorner(cornerId), JSON.stringify(nextCorner));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return cand;
  }

  async getCandidate(casefileId, cornerId, candidateId) {
    const corner = await this.requireCorner(casefileId, cornerId);
    const cand = (corner.candidates || []).find((c) => c.id === candidateId);
    if (!cand) throw new HttpError(404, "Candidate not found.", "not_found");
    return cand;
  }

  async updateCandidate(casefileId, cornerId, candidateId, patch = {}) {
    const cf = await this.requireCasefile(casefileId);
    const corner = await this.requireCorner(casefileId, cornerId);

    const nextCorner = structuredClone(corner);
    const idx = (nextCorner.candidates || []).findIndex((c) => c.id === candidateId);
    if (idx < 0) throw new HttpError(404, "Candidate not found.", "not_found");

    const cand = structuredClone(nextCorner.candidates[idx]);

    if (patch.kind != null) {
      const k = normalizeCandidateKind(patch.kind);
      if (!k) throw new HttpError(400, "Invalid candidate kind.", "bad_request");
      cand.kind = k;
    }
    if (patch.summary != null) {
      const s = String(patch.summary).trim();
      if (!s) throw new HttpError(400, "summary cannot be empty.", "bad_request");
      cand.summary = s;
    }
    if (patch.weight != null) cand.weight = clampInt(patch.weight, cand.weight, 1, 5);

    if (patch.refEvidenceId !== undefined) {
      if (patch.refEvidenceId === null) cand.refEvidenceId = null;
      else {
        const eid = String(patch.refEvidenceId).trim();
        if (!isUuidLike(eid)) throw new HttpError(400, "refEvidenceId must be a uuid or null.", "bad_request");
        await this.requireEvidence(casefileId, eid);
        cand.refEvidenceId = eid;
      }
    }

    nextCorner.candidates[idx] = cand;
    nextCorner.updatedAt = nowIso();
    cf.meta.updatedAt = nextCorner.updatedAt;

    const multi = this.redis.multi();
    multi.set(this.kCorner(cornerId), JSON.stringify(nextCorner));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return cand;
  }

  async deleteCandidate(casefileId, cornerId, candidateId) {
    const cf = await this.requireCasefile(casefileId);
    const corner = await this.requireCorner(casefileId, cornerId);

    const nextCorner = structuredClone(corner);
    const before = Array.isArray(nextCorner.candidates) ? nextCorner.candidates.length : 0;
    nextCorner.candidates = (nextCorner.candidates || []).filter((c) => c.id !== candidateId);

    if (nextCorner.candidates.length === before) throw new HttpError(404, "Candidate not found.", "not_found");

    nextCorner.updatedAt = nowIso();
    cf.meta.updatedAt = nextCorner.updatedAt;

    const multi = this.redis.multi();
    multi.set(this.kCorner(cornerId), JSON.stringify(nextCorner));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return { deleted: true };
  }

  async chooseCandidate(casefileId, cornerId, candidateId) {
    const cf = await this.requireCasefile(casefileId);
    const corner = await this.requireCorner(casefileId, cornerId);

    const nextCorner = structuredClone(corner);
    const candidates = nextCorner.candidates || [];
    const target = candidates.find((c) => c.id === candidateId);
    if (!target) throw new HttpError(404, "Candidate not found.", "not_found");

    candidates.forEach((c) => { c.chosen = (c.id === candidateId); });
    nextCorner.candidates = candidates;
    nextCorner.updatedAt = nowIso();
    cf.meta.updatedAt = nextCorner.updatedAt;

    // append decision log entry
    await this.appendDecision(casefileId, {
      cornerId,
      cornerName: nextCorner.name || "",
      action: "chooseCandidate",
      detail: `Chosen candidate ${candidateId}`,
      at: nextCorner.updatedAt,
    }, { skipCasefileUpdate: true });

    const multi = this.redis.multi();
    multi.set(this.kCorner(cornerId), JSON.stringify(nextCorner));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return nextCorner;
  }

  async unchooseCandidate(casefileId, cornerId, candidateId) {
    const cf = await this.requireCasefile(casefileId);
    const corner = await this.requireCorner(casefileId, cornerId);

    const nextCorner = structuredClone(corner);
    const candidates = nextCorner.candidates || [];
    const target = candidates.find((c) => c.id === candidateId);
    if (!target) throw new HttpError(404, "Candidate not found.", "not_found");

    target.chosen = false;
    target.justification = "";
    nextCorner.updatedAt = nowIso();
    cf.meta.updatedAt = nextCorner.updatedAt;

    await this.appendDecision(casefileId, {
      cornerId,
      cornerName: nextCorner.name || "",
      action: "unchooseCandidate",
      detail: `Unchosen candidate ${candidateId}`,
      at: nextCorner.updatedAt,
    }, { skipCasefileUpdate: true });

    const multi = this.redis.multi();
    multi.set(this.kCorner(cornerId), JSON.stringify(nextCorner));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return nextCorner;
  }

  async saveCornerDecision(casefileId, cornerId, body = {}) {
    const cf = await this.requireCasefile(casefileId);
    const corner = await this.requireCorner(casefileId, cornerId);

    const justification = String(body?.justification ?? "");
    if (!justification.trim()) throw new HttpError(400, "justification is required.", "bad_request");

    const nextCorner = structuredClone(corner);
    const chosen = (nextCorner.candidates || []).find((c) => c.chosen);
    if (!chosen) throw new HttpError(409, "No chosen candidate for this corner.", "conflict");

    chosen.justification = justification;
    nextCorner.updatedAt = nowIso();
    cf.meta.updatedAt = nextCorner.updatedAt;

    await this.appendDecision(casefileId, {
      cornerId,
      cornerName: nextCorner.name || "",
      action: "saveDecision",
      detail: `Saved justification for candidate ${chosen.id}`,
      at: nextCorner.updatedAt,
    }, { skipCasefileUpdate: true });

    const multi = this.redis.multi();
    multi.set(this.kCorner(cornerId), JSON.stringify(nextCorner));
    multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    await multi.exec();

    return nextCorner;
  }

  /* ------------------------------ decisions ------------------------------ */

  async listDecisions(casefileId, { limit, offset, cornerId } = {}) {
    await this.requireCasefile(casefileId);
    const lim = clampInt(limit, 50, 1, 500);
    const off = clampInt(offset, 0, 0, 1_000_000);

    const ids = await this.redis.zrange(this.kDecisionIndex(casefileId), 0, -1);
    const rows = (await this._mgetJson(ids.map((id) => this.kDecision(id)))).filter(Boolean);

    let filtered = rows;
    if (cornerId != null) {
      filtered = filtered.filter((d) => String(d.cornerId || "") === String(cornerId));
    }

    return { items: filtered.slice(off, off + lim), limit: lim, offset: off, total: filtered.length };
  }

  async appendDecision(casefileId, body = {}, internal = {}) {
    const cf = await this.requireCasefile(casefileId);

    const action = String(body?.action || "").trim();
    if (!action) throw new HttpError(400, "action is required.", "bad_request");

    const id = randomUUID();
    const at = body?.at ? String(body.at) : nowIso();

    const decision = {
      id,
      casefileId,
      at,
      cornerId: body?.cornerId === null ? null : (body?.cornerId ? String(body.cornerId) : null),
      cornerName: String(body?.cornerName ?? ""),
      action,
      detail: String(body?.detail ?? ""),
    };

    const multi = this.redis.multi();
    multi.set(this.kDecision(id), JSON.stringify(decision));
    multi.zadd(this.kDecisionIndex(casefileId), toScoreFromIso(at), id);

    if (!internal?.skipCasefileUpdate) {
      cf.counts.decisions += 1;
      cf.meta.updatedAt = at;
      multi.set(this.kCasefile(casefileId), JSON.stringify(cf));
      multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(cf.meta.updatedAt), casefileId);
    }

    await multi.exec();
    return decision;
  }

  /* ------------------------------ traverse ------------------------------ */

  async getTraverseConfig(casefileId) {
    const cf = await this.requireCasefile(casefileId);
    return cf.traverse;
  }

  async updateTraverseConfig(casefileId, patch = {}) {
    const cf = await this.requireCasefile(casefileId);
    const next = structuredClone(cf);

    if (patch.start != null) {
      const N = Number(patch.start.N);
      const E = Number(patch.start.E);
      if (!Number.isFinite(N) || !Number.isFinite(E)) throw new HttpError(400, "start.N and start.E must be numbers.", "bad_request");
      next.traverse.start = { N, E };
    }
    if (patch.basis != null) {
      const label = String(patch.basis.label ?? next.traverse.basis.label ?? "BASIS");
      const rotationDeg = Number(patch.basis.rotationDeg ?? next.traverse.basis.rotationDeg ?? 0);
      if (!Number.isFinite(rotationDeg)) throw new HttpError(400, "basis.rotationDeg must be a number.", "bad_request");
      next.traverse.basis = { label, rotationDeg };
    }
    if (patch.calls != null) {
      const calls = Array.isArray(patch.calls) ? patch.calls.map(String).filter(isUuidLike) : null;
      if (!calls) throw new HttpError(400, "calls must be an array of uuids.", "bad_request");
      next.traverse.calls = calls;
    }

    next.meta.updatedAt = nowIso();

    const multi = this.redis.multi();
    multi.set(this.kCasefile(casefileId), JSON.stringify(next));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(next.meta.updatedAt), casefileId);
    await multi.exec();

    return next.traverse;
  }

  async syncIncludedCallsFromIncludedExtractions(casefileId) {
    const cf = await this.requireCasefile(casefileId);
    const ids = await this.redis.zrange(this.kExtractionIndex(casefileId), 0, -1);
    const rows = (await this._mgetJson(ids.map((id) => this.kExtraction(id)))).filter(Boolean);

    const includedIds = rows.filter((x) => x.include !== false).map((x) => x.id);

    const next = structuredClone(cf);
    next.traverse.calls = includedIds;
    next.meta.updatedAt = nowIso();

    const multi = this.redis.multi();
    multi.set(this.kCasefile(casefileId), JSON.stringify(next));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(next.meta.updatedAt), casefileId);
    await multi.exec();

    return next.traverse;
  }

  async runTraverse(casefileId, body = {}) {
    const cf = await this.requireCasefile(casefileId);

    const overrideCalls = Array.isArray(body?.overrideCalls) ? body.overrideCalls.map(String).filter(isUuidLike) : null;
    const overrideRotationDeg = body?.overrideRotationDeg;

    const callIds = overrideCalls ?? (Array.isArray(cf.traverse.calls) ? cf.traverse.calls : []);
    const rotationDeg = overrideRotationDeg != null ? Number(overrideRotationDeg) : Number(cf.traverse.basis?.rotationDeg || 0);
    if (!Number.isFinite(rotationDeg)) throw new HttpError(422, "rotationDeg must be numeric.", "unprocessable_entity");

    // materialize calls as extraction objects (in given order)
    const calls = [];
    for (const id of callIds) {
      const ex = await this.getJson(this.kExtraction(id));
      if (!ex) {
        // if missing extraction, treat as warning and skip
        calls.push({ id, label: `MISSING ${id}`, bearingText: "", distance: NaN });
      } else {
        calls.push(ex);
      }
    }

    const results = runTraverseCompute({
      casefileId,
      start: cf.traverse.start,
      rotationDeg,
      calls,
    });

    const envelope = { lastRun: results.computedAt, results };

    // persist envelope + update casefile.traverse.lastRun
    const next = structuredClone(cf);
    next.traverse.lastRun = results.computedAt;
    next.meta.updatedAt = results.computedAt;

    const multi = this.redis.multi();
    multi.set(this.kTraverseResults(casefileId), JSON.stringify(envelope));
    multi.set(this.kCasefile(casefileId), JSON.stringify(next));
    multi.zadd(this.kCasefilesUpdated(), toScoreFromIso(next.meta.updatedAt), casefileId);
    await multi.exec();

    return results;
  }

  async getTraverseResults(casefileId) {
    await this.requireCasefile(casefileId);
    const env = await this.getJson(this.kTraverseResults(casefileId));
    if (env && typeof env === "object" && "lastRun" in env && "results" in env) return env;
    return { lastRun: null, results: null };
  }

  /* ------------------------------ outputs/package ------------------------------ */

  async getPrintablePackage(casefileId) {
    const cf = await this.requireCasefile(casefileId);

    const [evidenceIds, extractionIds, cornerIds, traverseEnv] = await Promise.all([
      this.redis.zrange(this.kEvidenceIndex(casefileId), 0, -1),
      this.redis.zrange(this.kExtractionIndex(casefileId), 0, -1),
      this.redis.zrange(this.kCornerIndex(casefileId), 0, -1),
      this.getTraverseResults(casefileId),
    ]);

    const [evidence, extractions, corners] = await Promise.all([
      this._mgetJson(evidenceIds.map((id) => this.kEvidence(id))),
      this._mgetJson(extractionIds.map((id) => this.kExtraction(id))),
      this._mgetJson(cornerIds.map((id) => this.kCorner(id))),
    ]);

    const evidenceRegister = evidence.filter(Boolean);
    const extractionRows = extractions.filter(Boolean);

    const includedCalls = extractionRows.filter((x) => x.include !== false);

    const cornerSelections = (corners.filter(Boolean)).map((corner) => {
      const cands = Array.isArray(corner.candidates) ? corner.candidates : [];
      const chosen = cands.find((c) => c.chosen) || null;
      const maxWeight = cands.reduce((m, c) => Math.max(m, Number(c.weight || 0)), 0);
      const requiresJustification = Boolean(chosen && Number(chosen.weight || 0) >= 4 && !String(chosen.justification || "").trim());
      return {
        corner,
        chosenCandidate: chosen,
        maxWeight,
        requiresJustification,
      };
    });

    return {
      casefile: cf,
      evidenceRegister,
      includedCalls,
      cornerSelections,
      traverse: traverseEnv,
      generatedAt: nowIso(),
    };
  }
}
