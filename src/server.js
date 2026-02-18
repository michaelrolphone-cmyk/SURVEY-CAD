import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SurveyCadClient from './survey-api.js';
import { createRosOcrApp } from './ros-ocr-api.js';
import { listApps } from './app-catalog.js';
import { buildProjectArchivePlan, createProjectFile, PROJECT_FILE_FOLDERS } from './project-file.js';
import { LocalStorageSyncStore } from './localstorage-sync-store.js';
import { createRedisLocalStorageSyncStore } from './redis-localstorage-sync-store.js';
import { createLineforgeCollabService } from './lineforge-collab.js';
import { createLocalStorageSyncWsService } from './localstorage-sync-ws.js';
import { createCrewPresenceWsService } from './crew-presence-ws.js';
import { createWorkerSchedulerService } from './worker-task-ws.js';
import { createLmProxyHubWsService } from "./lmstudio-proxy-control-ws.js";
import { createRedisClient as createBewRedisClient } from "./bew-redis.js";

import { loadFldConfig } from './fld-config.js';
import {
  getCrewProfiles,
  getEquipmentInventory,
  getEquipmentLogs,
  findCrewMemberById,
  findEquipmentById,
  findEquipmentLogById,
  saveCrewMember,
  saveEquipmentItem,
  saveEquipmentLog,
} from './crew-equipment-api.js';

/* ------------------------------ BEW integration ------------------------------ */
/* IMPORTANT: namespace imports so missing named exports do not crash on Heroku */
import * as BewRoutes from './bew-routes.js';
import * as BewStore from './bew-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_STATIC_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SMALL_ASSET_CACHE_MAX_BYTES = 4 * 1024;
const smallStaticAssetCache = new Map();

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getErrorStatusCode(err) {
  const message = err?.message || '';
  if (/^HTTP\s+\d{3}:/i.test(message)) return 502;
  return 400;
}

function parseRemotePdfUrl(urlObj) {
  const rawUrl = urlObj.searchParams.get('url');
  if (!rawUrl) throw new Error('url query parameter is required.');

  let parsed;
  try { parsed = new URL(rawUrl); }
  catch { throw new Error('url query parameter must be a valid absolute URL.'); }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported for ROS PDF loading.');
  }
  return parsed.toString();
}

function parseLonLat(urlObj) {
  const lon = Number(urlObj.searchParams.get('lon'));
  const lat = Number(urlObj.searchParams.get('lat'));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error('Valid numeric lon and lat query parameters are required.');
  }
  return { lon, lat };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildFallbackStaticMapSvg(lat, lon, address = '') {
  const title = address.trim() || `Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)}`;
  const safeTitle = escapeHtml(title);
  const safeCoordinates = escapeHtml(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-label="Project map fallback for ${safeTitle}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="1600" height="1000" fill="url(#bg)" />
  <circle cx="800" cy="500" r="14" fill="#ef4444" />
  <circle cx="800" cy="500" r="42" fill="none" stroke="#f87171" stroke-opacity="0.55" stroke-width="4" />
  <text x="800" y="560" fill="#e2e8f0" text-anchor="middle" font-size="36" font-family="Inter, system-ui, sans-serif">${safeTitle}</text>
  <text x="800" y="610" fill="#94a3b8" text-anchor="middle" font-size="24" font-family="Inter, system-ui, sans-serif">${safeCoordinates}</text>
</svg>`;
}

function lonLatToTile(lat, lon, zoom = 17) {
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * n);
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1), zoom };
}

const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const VALID_FOLDER_KEYS = new Set(PROJECT_FILE_FOLDERS.map((f) => f.key));

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 200);
}

async function parseMultipartUpload(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
  if (!boundaryMatch) throw new Error('Missing multipart boundary.');
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_UPLOAD_FILE_BYTES + 1024 * 1024) {
      req.destroy();
      throw new Error(`Upload exceeds maximum allowed size of ${MAX_UPLOAD_FILE_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  const fields = {};
  let fileBuffer = null;
  let fileName = '';

  let start = body.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;

    const headerEnd = body.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headerBlock = body.slice(start, headerEnd).toString('utf8');
    const bodyStart = headerEnd + 4;

    const nextDelimiter = body.indexOf(delimiter, bodyStart);
    const bodyEnd = nextDelimiter !== -1 ? nextDelimiter - 2 : body.length;
    const partBody = body.slice(bodyStart, bodyEnd);

    const nameMatch = headerBlock.match(/name="([^"]+)"/);
    const filenameMatch = headerBlock.match(/filename="([^"]+)"/);

    if (nameMatch) {
      if (filenameMatch) {
        fileBuffer = partBody;
        fileName = filenameMatch[1];
      } else {
        fields[nameMatch[1]] = partBody.toString('utf8');
      }
    }

    start = nextDelimiter !== -1 ? nextDelimiter : -1;
  }

  return { fields, fileBuffer, fileName };
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      req.destroy();
      throw new Error(`Request body exceeds maximum allowed size of ${MAX_JSON_BODY_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

async function serveStaticFile(urlPath, staticDir, res) {
  const requested = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const safePath = requested.replace(/^\/+/, '');
  const absPath = await resolveStaticPath(staticDir, safePath);

  if (!absPath.startsWith(path.resolve(staticDir))) {
    sendJson(res, 403, { error: 'Forbidden path.' });
    return;
  }

  try {
    const body = await readStaticAsset(absPath);
    const ext = path.extname(absPath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', resolveStaticCacheControl(absPath));
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found.' });
  }
}

function isSmallStaticAsset(absPath) {
  const normalized = absPath.replace(/\\/g, '/').toLowerCase();
  return normalized.includes('/assets/icons/') || normalized.includes('/assets/survey-symbols/');
}

function resolveStaticCacheControl(absPath) {
  if (isSmallStaticAsset(absPath)) return 'public, max-age=31536000, immutable';
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=300';
}

async function readStaticAsset(absPath) {
  const cached = smallStaticAssetCache.get(absPath);
  if (cached) return cached;

  const body = await readFile(absPath);
  if (isSmallStaticAsset(absPath) && body.byteLength <= SMALL_ASSET_CACHE_MAX_BYTES) {
    smallStaticAssetCache.set(absPath, body);
  }
  return body;
}

async function resolveStaticPath(staticDir, safePath) {
  const base = path.resolve(staticDir);
  const initialPath = path.resolve(base, safePath);

  if (initialPath.startsWith(base)) {
    try {
      await access(initialPath);
      return initialPath;
    } catch { /* fall through */ }
  }

  const segments = safePath.split('/').filter(Boolean);
  let currentDir = base;

  for (const segment of segments) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const matched = entries.find((entry) => entry.name === segment)
      || entries.find((entry) => entry.name.toLowerCase() === segment.toLowerCase());

    if (!matched) return initialPath;
    currentDir = path.resolve(currentDir, matched.name);
  }

  return currentDir;
}

/* ------------------------------ BEW router adapter ------------------------------ */

const BEW_PREFIXES = [
  '/casefiles',
  '/casefile',
  '/evidence',
  '/extractions',
  '/corners',
  '/decisions',
  '/traverse',
  '/package',
  '/packages',
  '/bew',
  '/api/bew',
];

function isBewPath(pathname) {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  return BEW_PREFIXES.some((pref) => p === pref || p.startsWith(pref + '/'));
}

function pickFirstFunction(mod, names) {
  for (const n of names) {
    const v = mod?.[n];
    if (typeof v === 'function') return v;
  }
  return null;
}

function pickFirstObject(mod, names) {
  for (const n of names) {
    const v = mod?.[n];
    if (v && typeof v === 'object') return v;
  }
  return null;
}

async function writeFetchResponse(res, response) {
  res.statusCode = Number(response.status) || 200;
  for (const [k, v] of response.headers.entries()) res.setHeader(k, v);
  const ab = await response.arrayBuffer();
  res.end(Buffer.from(ab));
}

function looksLikeFetchResponse(x) {
  return typeof Response !== 'undefined' && x instanceof Response;
}

function normalizeBewHandler(product) {
  if (!product) return null;

  // function handler
  if (typeof product === 'function') {
    return async (req, res, urlObj, ctx) => {
      const beforeEnded = res.writableEnded;
      const out = await product(req, res, urlObj, ctx);
      if (res.writableEnded && !beforeEnded) return true;
      if (out === true) return true;
      if (out === false || out == null) return false;
      if (looksLikeFetchResponse(out)) {
        await writeFetchResponse(res, out);
        return true;
      }
      if (typeof out === 'object' && out?.handled === true) return true;
      return Boolean(res.writableEnded);
    };
  }

  // object with handler
  if (typeof product === 'object') {
    const fn =
      (typeof product.handle === 'function' && product.handle) ||
      (typeof product.handler === 'function' && product.handler) ||
      (typeof product.dispatch === 'function' && product.dispatch) ||
      null;

    if (fn) return normalizeBewHandler(fn);

    // routes array
    const routes = Array.isArray(product.routes) ? product.routes : (Array.isArray(product) ? product : null);
    if (routes) {
      return async (req, res, urlObj, ctx) => {
        const method = String(req.method || 'GET').toUpperCase();
        const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
        for (const r of routes) {
          const rm = String(r?.method || r?.verb || 'GET').toUpperCase();
          const rp = String(r?.path || r?.pathname || r?.pattern || '');
          const handler = r?.handler || r?.handle || r?.fn;
          if (!rp || typeof handler !== 'function') continue;
          if (rm !== method) continue;

          const match = matchRoute(pathname, rp);
          if (!match.ok) continue;

          const out = await handler({ req, res, url: urlObj, params: match.params, ctx });
          if (res.writableEnded) return true;
          if (out === true) return true;
          if (looksLikeFetchResponse(out)) {
            await writeFetchResponse(res, out);
            return true;
          }
          // if handler returned nothing but wrote to res, handled.
          if (res.writableEnded) return true;
        }
        return false;
      };
    }
  }

  return null;
}

function matchRoute(pathname, pattern) {
  const p = String(pattern || '').trim();
  if (!p) return { ok: false, params: {} };

  // exact
  if (!p.includes(':') && !p.includes('*')) {
    const ok = (pathname === p) || (pathname === p.replace(/\/+$/, ''));
    return { ok, params: {} };
  }

  const a = pathname.split('/').filter(Boolean);
  const b = p.split('/').filter(Boolean);

  const params = {};
  for (let i = 0, j = 0; i < a.length && j < b.length; i += 1, j += 1) {
    const token = b[j];
    if (token === '*') return { ok: true, params };
    if (token.startsWith(':')) {
      params[token.slice(1)] = a[i];
      continue;
    }
    if (token !== a[i]) return { ok: false, params: {} };
  }

  if (a.length === b.length) return { ok: true, params };
  if (b[b.length - 1] === '*') return { ok: true, params };
  return { ok: false, params: {} };
}

// singleton BEW runtime
let _bewPromise = null;
let _bewRuntime = null;

function findHerokuRedisUrl() {
  const direct =
    process.env.BEW_REDIS_URL ||
    process.env.REDIS_URL ||
    process.env.REDIS_TLS_URL ||
    process.env.REDISCLOUD_URL;

  if (direct) return direct;

  // scan env for anything that looks like a Heroku redis URL
  for (const [k, v] of Object.entries(process.env)) {
    if (!v) continue;
    if (!/URL$/i.test(k)) continue;
    if (!/REDIS/i.test(k)) continue;
    if (String(v).startsWith('redis://') || String(v).startsWith('rediss://')) return String(v);
  }
  return null;
}
function isIoredisLike(client) {
  return !!client && typeof client.multi === "function" && typeof client.zrevrange === "function";
}

async function ensureBew({ existingRedis = null } = {}) {
  if (_bewRuntime) return _bewRuntime;
  if (_bewPromise) return _bewPromise;

  _bewPromise = (async () => {
    const redisUrl = findHerokuRedisUrl();

    const redis =
      (isIoredisLike(existingRedis) ? existingRedis : null) ||
      (() => {
        if (!redisUrl) {
          throw new Error("Missing Heroku Redis URL env (REDIS_URL / REDIS_TLS_URL / REDISCLOUD_URL).");
        }
        return createBewRedisClient({ url: redisUrl });
      })();

    // only connect if we created it (or if it's ioredis and not connected yet)
    if (!isIoredisLike(existingRedis)) {
      await redis.connect(); // ensures listeners exist before TLS handshake
    }

    const StoreCtor =
      BewStore.RedisBewStore ||
      BewStore.BewStore ||
      BewStore.Store ||
      (typeof BewStore.default === "function" ? BewStore.default : null);

    if (!StoreCtor) {
      throw new Error(
        `BEW store module missing RedisBewStore export. Exports: ${Object.keys(BewStore || {}).join(", ") || "(none)"}`
      );
    }

    const store = new StoreCtor(redis, {
      prefix: process.env.BEW_REDIS_PREFIX || "bew",
      attachmentMaxBytes: process.env.BEW_ATTACHMENT_MAX_BYTES ? Number(process.env.BEW_ATTACHMENT_MAX_BYTES) : undefined,
    });

    const createRoutes = pickFirstFunction(BewRoutes, [
      "createBewRoutes",
      "createBewRouter",
      "createRoutes",
      "createRouter",
      "default",
    ]);

    let routesProduct = null;
    if (createRoutes) {
      routesProduct = await createRoutes({ store, redis, redisUrl });
    } else {
      routesProduct =
        pickFirstFunction(BewRoutes, ["handle", "handler", "dispatch"]) ||
        pickFirstObject(BewRoutes, ["routes", "router", "api", "service", "default"]) ||
        (typeof BewRoutes.default === "function" ? BewRoutes.default : null);
    }

    const handler = normalizeBewHandler(routesProduct);
    if (!handler) {
      throw new Error(
        `BEW routes module did not provide a usable handler/factory. Exports: ${Object.keys(BewRoutes || {}).join(", ") || "(none)"}`
      );
    }

    const HttpError = BewStore.HttpError || null;

    _bewRuntime = {
      redisUrl,
      redis,
      store,
      HttpError,
      handler,
      close: async () => {
        // only quit if we created the client (not reusing existingRedis)
        if (!isIoredisLike(existingRedis) && redis && typeof redis.quit === "function") {
          try { await redis.quit(); } catch {}
        }
      },
    };

    return _bewRuntime;
  })();

  return _bewPromise;
}


function sendBewError(res, err) {
  const status = Number(err?.status);
  const statusCode = Number.isFinite(status) ? status : 500;
  const payload = {
    error: err?.message || 'BEW request failed.',
    code: err?.code || 'error',
    details: err?.details ?? undefined,
  };
  sendJson(res, statusCode, payload);
}

/* ------------------------------ server ------------------------------ */

export function createSurveyServer({
  client = new SurveyCadClient(),
  staticDir = DEFAULT_STATIC_DIR,
  rosOcrHandler,
  staticMapFetcher = fetch,
  localStorageSyncStore = new LocalStorageSyncStore(),
} = {}) {
  let rosOcrHandlerPromise = rosOcrHandler ? Promise.resolve(rosOcrHandler) : null;

  const lineforgeCollab = createLineforgeCollabService();
  const localStorageSyncWsService = createLocalStorageSyncWsService({ store: localStorageSyncStore });
  const workerSocket = createWorkerSchedulerService();
  const crewPresence = createCrewPresenceWsService();
  const lmProxy = createLmProxyHubWsService({
    path: "/ws/lmproxy",
    token: process.env.CONTROL_TOKEN || "",
    requestTimeoutMs: 120_000
  });

  const pointforgeExportStore = new Map();

  const resolveStoreState = () => Promise.resolve(localStorageSyncStore.getState());
  const syncIncomingState = (payload) => Promise.resolve(localStorageSyncStore.syncIncoming(payload));

  // optional reuse: if your localStorage sync store exposes the ioredis client, BEW will share it
  const existingRedis = localStorageSyncStore?.redis || localStorageSyncStore?.client || null;

  // ensure BEW redis closes on server close (only if we created it)
  let bewCloseHookInstalled = false;

  const server = createServer(async (req, res) => {
    if (!req.url) {
      sendJson(res, 400, { error: 'Missing request URL.' });
      return;
    }

    const urlObj = new URL(req.url, 'http://localhost');

    try {
      if (urlObj.pathname === '/extract') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }
        if (!rosOcrHandlerPromise) rosOcrHandlerPromise = createRosOcrApp();
        const app = await rosOcrHandlerPromise;
        app(req, res);
        return;
      }

      // --- BEW routes (casefiles, evidence, extractions, corners, decisions, traverse, package) ---
      if (isBewPath(urlObj.pathname)) {
        let bew;
        try {
          bew = await ensureBew({ existingRedis });
          if (!bewCloseHookInstalled) {
            bewCloseHookInstalled = true;
            server.on('close', () => { Promise.resolve(bew.close()).catch(() => {}); });
          }
        } catch (e) {
          // BEW is required for these paths; fail explicitly
          sendJson(res, 503, {
            error: 'BEW unavailable (Redis/routes init failed).',
            details: e?.message || String(e),
          });
          return;
        }

        try {
          const handled = await bew.handler(req, res, urlObj, { store: bew.store, redis: bew.redis, redisUrl: bew.redisUrl });
          if (handled || res.writableEnded) return;

          // If a BEW path reaches here, treat as not found rather than falling into static assets.
          sendJson(res, 404, { error: 'BEW endpoint not found.' });
          return;
        } catch (err) {
          // Prefer BEW HttpError shape (status/code/details)
          if (bew?.HttpError && err instanceof bew.HttpError) {
            sendBewError(res, err);
            return;
          }
          if (Number.isFinite(Number(err?.status)) && err?.message) {
            sendBewError(res, err);
            return;
          }
          sendJson(res, 500, { error: err?.message || String(err) });
          return;
        }
      }

      // --- Worker task submit (MUST be before the "Only GET is supported" gate) ---
      if (urlObj.pathname === '/api/worker/submit' || urlObj.pathname === '/api/worker/submit/') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }

        const body = await readJsonBody(req);

        const poolId = String(body.poolId || 'default');
        const kind = String(body.kind || '');
        const payload = body.payload ?? null;

        if (!kind) {
          sendJson(res, 400, { error: 'kind is required.' });
          return;
        }

        const workers = workerSocket.listWorkers(poolId);
        if (!workers.some(w => w.online)) {
          sendJson(res, 503, { error: 'No online workers in pool.', workers });
          return;
        }

        const p = workerSocket.submitTask(poolId, kind, payload);
        const taskId = p.taskId;

        try {
          const result = await p;
          sendJson(res, 200, { ok: true, taskId, result });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            taskId,
            error: err?.message || String(err),
            details: err?.details ?? null,
          });
        }
        return;
      }

      // optional: list workers
      if (urlObj.pathname === '/api/worker/workers' || urlObj.pathname === '/api/worker/workers/') {
        const poolId = String(urlObj.searchParams.get('pool') || 'default');
        sendJson(res, 200, { workers: workerSocket.listWorkers(poolId) });
        return;
      }

      if (urlObj.pathname === '/api/fld-config') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        const requestedPath = urlObj.searchParams.get('file') || 'config/MLS.fld';
        const safePath = requestedPath.replace(/^\/+/, '');
        const absolutePath = path.resolve(staticDir, safePath);
        if (!absolutePath.startsWith(path.resolve(staticDir))) {
          sendJson(res, 403, { error: 'Forbidden path.' });
          return;
        }
        const config = await loadFldConfig(absolutePath);
        sendJson(res, 200, config);
        return;
      }

      // --- PointForge export persistence ---
      if (urlObj.pathname === '/api/pointforge-exports' || urlObj.pathname === '/api/pointforge-exports/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body || typeof body !== 'object') {
            sendJson(res, 400, { error: 'Request body must be a JSON object.' });
            return;
          }
          if (!body.modifiedCsv || typeof body.modifiedCsv !== 'string') {
            sendJson(res, 400, { error: 'modifiedCsv (string) is required.' });
            return;
          }
          const id = `pf-export-${Date.now()}-${randomUUID().slice(0, 8)}`;
          const record = {
            id,
            roomId: String(body.roomId || 'default'),
            originalCsv: typeof body.originalCsv === 'string' ? body.originalCsv : '',
            modifiedCsv: body.modifiedCsv,
            georeference: body.georeference || null,
            metadata: body.metadata || {},
            createdAt: new Date().toISOString(),
          };
          pointforgeExportStore.set(id, record);
          lineforgeCollab.broadcastToRoom(record.roomId, { type: 'pointforge-import', exportId: id, at: Date.now() });
          sendJson(res, 201, { export: record });
          return;
        }
        if (req.method === 'GET') {
          const id = urlObj.searchParams.get('id');
          if (id) {
            const record = pointforgeExportStore.get(id);
            if (!record) {
              sendJson(res, 404, { error: 'Export not found.' });
              return;
            }
            sendJson(res, 200, { export: record });
            return;
          }
          const roomId = urlObj.searchParams.get('room') || 'default';
          const exports = [];
          for (const record of pointforgeExportStore.values()) {
            if (record.roomId === roomId) exports.push(record);
          }
          exports.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          sendJson(res, 200, { exports });
          return;
        }
        sendJson(res, 405, { error: 'Only GET and POST are supported.' });
        return;
      }

      if (urlObj.pathname === '/api/localstorage-sync') {
        if (req.method === 'GET') {
          sendJson(res, 200, await resolveStoreState());
          return;
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = await syncIncomingState({ version: body.version, snapshot: body.snapshot });
          sendJson(res, 200, result);
          return;
        }
        sendJson(res, 405, { error: 'Only GET and POST are supported.' });
        return;
      }

      if (urlObj.pathname === '/api/crew' || urlObj.pathname === '/api/crew/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body || typeof body !== 'object' || (!body.firstName && !body.lastName)) {
            sendJson(res, 400, { error: 'firstName or lastName is required.' });
            return;
          }
          const member = {
            id: body.id || randomUUID(),
            firstName: body.firstName || '',
            lastName: body.lastName || '',
            jobTitle: body.jobTitle || '',
            phone: body.phone || '',
            email: body.email || '',
            certifications: body.certifications || '',
            notes: body.notes || '',
            roles: Array.isArray(body.roles) ? body.roles : [],
            photo: body.photo || null,
            createdAt: body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const result = await saveCrewMember(localStorageSyncStore, member);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result.operations,
            state: { version: result.state.version, checksum: result.state.checksum },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 201, { member });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET and POST are supported.' });
          return;
        }
        const state = await resolveStoreState();
        const profiles = getCrewProfiles(state.snapshot);
        const id = urlObj.searchParams.get('id');
        if (id) {
          const member = findCrewMemberById(state.snapshot, id);
          sendJson(res, member ? 200 : 404, member ? { member } : { error: 'Crew member not found.' });
          return;
        }
        sendJson(res, 200, { crew: profiles });
        return;
      }

      if (urlObj.pathname === '/api/crew-presence' || urlObj.pathname === '/api/crew-presence/') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        sendJson(res, 200, { online: crewPresence.getOnlineCrewMemberIds() });
        return;
      }

      if (urlObj.pathname === '/api/equipment' || urlObj.pathname === '/api/equipment/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body || typeof body !== 'object' || (!body.make && !body.model)) {
            sendJson(res, 400, { error: 'make or model is required.' });
            return;
          }
          const item = {
            id: body.id || randomUUID(),
            make: body.make || '',
            model: body.model || '',
            equipmentType: body.equipmentType || '',
            serialNumber: body.serialNumber || '',
            createdAt: body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const result = await saveEquipmentItem(localStorageSyncStore, item);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result.operations,
            state: { version: result.state.version, checksum: result.state.checksum },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 201, { equipment: item });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET and POST are supported.' });
          return;
        }
        const state = await resolveStoreState();
        const inventory = getEquipmentInventory(state.snapshot);
        const id = urlObj.searchParams.get('id');
        if (id) {
          const item = findEquipmentById(state.snapshot, id);
          sendJson(res, item ? 200 : 404, item ? { equipment: item } : { error: 'Equipment not found.' });
          return;
        }
        sendJson(res, 200, { equipment: inventory });
        return;
      }

      if (urlObj.pathname === '/api/equipment-logs' || urlObj.pathname === '/api/equipment-logs/') {
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (!body || typeof body !== 'object' || (!body.rodman && !body.jobFileName)) {
            sendJson(res, 400, { error: 'rodman or jobFileName is required.' });
            return;
          }
          const log = {
            id: body.id || randomUUID(),
            rodman: body.rodman || '',
            equipmentHeight: body.equipmentHeight || '',
            referencePoint: body.referencePoint || '',
            setupTime: body.setupTime || '',
            teardownTime: body.teardownTime || '',
            jobFileName: body.jobFileName || '',
            equipmentType: body.equipmentType || '',
            notes: body.notes || '',
            createdAt: body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const result = await saveEquipmentLog(localStorageSyncStore, log);
          localStorageSyncWsService.broadcast({
            type: 'sync-differential-applied',
            operations: result.operations,
            state: { version: result.state.version, checksum: result.state.checksum },
            originClientId: null,
            requestId: null,
          });
          sendJson(res, 201, { log });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET and POST are supported.' });
          return;
        }
        const state = await resolveStoreState();
        const logs = getEquipmentLogs(state.snapshot);
        const id = urlObj.searchParams.get('id');
        if (id) {
          const log = findEquipmentLogById(state.snapshot, id);
          sendJson(res, log ? 200 : 404, log ? { log } : { error: 'Equipment log not found.' });
          return;
        }
        sendJson(res, 200, { logs });
        return;
      }

      if (urlObj.pathname === '/api/project-files/upload') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }
        const { fields, fileBuffer, fileName } = await parseMultipartUpload(req);
        const projectId = fields.projectId;
        const folderKey = fields.folderKey;
        if (!projectId || !folderKey) {
          sendJson(res, 400, { error: 'projectId and folderKey are required fields.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(folderKey)) {
          sendJson(res, 400, { error: `Invalid folderKey. Must be one of: ${[...VALID_FOLDER_KEYS].join(', ')}` });
          return;
        }
        if (!fileBuffer || !fileName) {
          sendJson(res, 400, { error: 'A file must be included in the upload.' });
          return;
        }
        if (fileBuffer.length > MAX_UPLOAD_FILE_BYTES) {
          sendJson(res, 400, { error: `File exceeds maximum size of ${MAX_UPLOAD_FILE_BYTES} bytes.` });
          return;
        }

        const sanitized = sanitizeFileName(fileName);
        const timestamp = Date.now();
        const storedName = `${timestamp}-${sanitized}`;
        const folderPath = path.join(UPLOADS_DIR, projectId, folderKey);
        await mkdir(folderPath, { recursive: true });
        const filePath = path.join(folderPath, storedName);
        await writeFile(filePath, fileBuffer);

        const ext = path.extname(sanitized).replace(/^\./, '').toLowerCase() || 'bin';
        const resourceId = `upload-${sanitized.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-]/g, '-')}-${timestamp}`;

        const resource = {
          id: resourceId,
          folder: folderKey,
          title: fileName,
          exportFormat: ext,
          reference: {
            type: 'server-upload',
            value: `/api/project-files/download?projectId=${encodeURIComponent(projectId)}&folderKey=${encodeURIComponent(folderKey)}&fileName=${encodeURIComponent(storedName)}`,
            resolverHint: 'evidence-desk-upload',
            metadata: {
              fileName,
              storedName,
              uploadedAt: new Date(timestamp).toISOString(),
              sizeBytes: fileBuffer.length,
            },
          },
        };

        sendJson(res, 201, { resource });
        return;
      }

      if (urlObj.pathname === '/api/project-files/download') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        const projectId = urlObj.searchParams.get('projectId');
        const folderKey = urlObj.searchParams.get('folderKey');
        const requestedFileName = urlObj.searchParams.get('fileName');
        if (!projectId || !folderKey || !requestedFileName) {
          sendJson(res, 400, { error: 'projectId, folderKey, and fileName are required.' });
          return;
        }
        if (!VALID_FOLDER_KEYS.has(folderKey)) {
          sendJson(res, 400, { error: 'Invalid folderKey.' });
          return;
        }
        const safeName = path.basename(requestedFileName);
        const filePath = path.join(UPLOADS_DIR, projectId, folderKey, safeName);
        if (!filePath.startsWith(path.join(UPLOADS_DIR, projectId, folderKey))) {
          sendJson(res, 403, { error: 'Forbidden path.' });
          return;
        }
        try { await access(filePath); }
        catch {
          sendJson(res, 404, { error: 'File not found.' });
          return;
        }
        const body = await readFile(filePath);
        const ext = path.extname(safeName).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(body);
        return;
      }

      if (urlObj.pathname === '/api/project-files/list') {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Only GET is supported.' });
          return;
        }
        const projectId = urlObj.searchParams.get('projectId');
        if (!projectId) {
          sendJson(res, 400, { error: 'projectId is required.' });
          return;
        }
        const projectDir = path.join(UPLOADS_DIR, projectId);
        const files = [];
        try {
          const folders = await readdir(projectDir, { withFileTypes: true });
          for (const folder of folders) {
            if (!folder.isDirectory() || !VALID_FOLDER_KEYS.has(folder.name)) continue;
            const folderFiles = await readdir(path.join(projectDir, folder.name));
            for (const f of folderFiles) files.push({ folderKey: folder.name, fileName: f });
          }
        } catch { /* empty */ }
        sendJson(res, 200, { files });
        return;
      }

      if (urlObj.pathname === '/api/project-file/compile') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Only POST is supported.' });
          return;
        }
        const body = await readJsonBody(req);
        const projectFile = body.projectFile || createProjectFile(body.project || {});
        const archivePlan = await buildProjectArchivePlan(projectFile);
        sendJson(res, 200, { projectFile, archivePlan });
        return;
      }

      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Only GET is supported.' });
        return;
      }

      if (urlObj.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (urlObj.pathname === '/api/apps') {
        sendJson(res, 200, { apps: listApps() });
        return;
      }

      if (urlObj.pathname === '/api/project-file/template') {
        const resourcesRaw = urlObj.searchParams.get('resources');
        let resources = [];
        if (resourcesRaw) {
          try {
            const parsed = JSON.parse(resourcesRaw);
            resources = Array.isArray(parsed) ? parsed : [];
          } catch {
            throw new Error('resources must be a JSON array when provided.');
          }
        }

        const projectFile = createProjectFile({
          projectId: urlObj.searchParams.get('projectId') || undefined,
          projectName: urlObj.searchParams.get('projectName') || undefined,
          client: urlObj.searchParams.get('client') || undefined,
          address: urlObj.searchParams.get('address') || undefined,
          resources,
        });
        sendJson(res, 200, { projectFile });
        return;
      }

      if (urlObj.pathname === '/api/lookup') {
        const address = urlObj.searchParams.get('address');
        if (!address) throw new Error('address query parameter is required.');
        const payload = await client.lookupByAddress(address);
        sendJson(res, 200, payload);
        return;
      }

      if (urlObj.pathname === '/api/geocode') {
        const address = urlObj.searchParams.get('address');
        if (!address) throw new Error('address query parameter is required.');
        const payload = await client.geocodeAddress(address);
        sendJson(res, 200, payload);
        return;
      }

      if (urlObj.pathname === '/api/utilities') {
        const address = urlObj.searchParams.get('address');
        if (!address) throw new Error('address query parameter is required.');
        const outSR = Number(urlObj.searchParams.get('outSR') || 2243);
        const sources = (urlObj.searchParams.get('sources') || 'power')
          .split(',')
          .map((source) => source.trim().toLowerCase())
          .filter(Boolean);
        const utilities = await client.lookupUtilityRecordsByAddress(address, { outSR, sources });
        sendJson(res, 200, { utilities, sources });
        return;
      }

      if (urlObj.pathname === '/api/static-map') {
        const { lon, lat } = parseLonLat(urlObj);
        const address = urlObj.searchParams.get('address') || '';
        const tile = lonLatToTile(lat, lon, 17);
        const satelliteTileUrl = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tile.zoom}/${tile.y}/${tile.x}`;
        const tileUrl = `https://tile.openstreetmap.org/${tile.zoom}/${tile.x}/${tile.y}.png`;
        const candidates = [satelliteTileUrl, tileUrl];

        try {
          for (const candidate of candidates) {
            let upstream;
            try {
              upstream = await staticMapFetcher(candidate, {
                headers: {
                  Accept: 'image/png,image/*;q=0.8,*/*;q=0.5',
                  'User-Agent': 'survey-cad/1.0 static-map-proxy',
                },
              });
            } catch { continue; }

            if (!upstream.ok) continue;

            const imageBuffer = Buffer.from(await upstream.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=1800');
            res.end(imageBuffer);
            return;
          }

          throw new Error('No static map provider available');
        } catch {
          const fallbackSvg = buildFallbackStaticMapSvg(lat, lon, address);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.end(fallbackSvg);
          return;
        }
      }

      if (urlObj.pathname === '/api/parcel') {
        const { lon, lat } = parseLonLat(urlObj);
        const outSR = Number(urlObj.searchParams.get('outSR') || 4326);
        const searchMeters = Number(urlObj.searchParams.get('searchMeters') || 40);
        const parcel = await client.findParcelNearPoint(lon, lat, outSR, searchMeters);
        sendJson(res, 200, { parcel });
        return;
      }

      if (urlObj.pathname === '/api/section') {
        const { lon, lat } = parseLonLat(urlObj);
        const section = await client.loadSectionAtPoint(lon, lat);
        sendJson(res, 200, { section });
        return;
      }

      if (urlObj.pathname === '/api/aliquots') {
        const { lon, lat } = parseLonLat(urlObj);
        const outSR = Number(urlObj.searchParams.get('outSR') || 4326);
        const section = await client.loadSectionAtPoint(lon, lat);
        if (!section) {
          sendJson(res, 404, { error: 'No section found at requested coordinates.' });
          return;
        }
        const aliquots = await client.loadAliquotsInSection(section, outSR);
        sendJson(res, 200, { section, aliquots });
        return;
      }

      if (urlObj.pathname === '/api/subdivision') {
        const { lon, lat } = parseLonLat(urlObj);
        const outSR = Number(urlObj.searchParams.get('outSR') || 4326);
        let subdivision;
        try {
          subdivision = await client.loadSubdivisionAtPoint(lon, lat, outSR);
        } catch (err) {
          if (outSR !== 4326) subdivision = await client.loadSubdivisionAtPoint(lon, lat, 4326);
          else throw err;
        }
        sendJson(res, 200, { subdivision });
        return;
      }

      if (urlObj.pathname === '/api/ros-pdf') {
        const remoteUrl = parseRemotePdfUrl(urlObj);
        const pdfResponse = await fetch(remoteUrl, {
          headers: {
            Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
            'User-Agent': 'survey-cad/1.0',
          },
        });

        if (!pdfResponse.ok) throw new Error(`HTTP ${pdfResponse.status}: ${remoteUrl}`);

        const contentType = pdfResponse.headers.get('content-type') || 'application/pdf';
        const contentDisposition = pdfResponse.headers.get('content-disposition');
        const body = Buffer.from(await pdfResponse.arrayBuffer());

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(body);
        return;
      }

      await serveStaticFile(urlObj.pathname, staticDir, res);
    } catch (err) {
      sendJson(res, getErrorStatusCode(err), { error: err.message || 'Bad request.' });
    }
  });

  server.on('upgrade', (req, socket, head) => {
    let wrote101 = false;
    const rawWrite = socket.write.bind(socket);

    socket.write = (chunk, ...args) => {
      try {
        const s = Buffer.isBuffer(chunk) ? chunk.toString('utf8', 0, 16) : String(chunk).slice(0, 16);
        if (s.startsWith('HTTP/1.1 101')) wrote101 = true;
      } catch {}
      return rawWrite(chunk, ...args);
    };

    let handled = false;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const p = url.pathname.replace(/\/+$/, '');

      if (p === '/ws/lmproxy') handled = !!lmProxy.handleUpgrade(req, socket, head);
      else if (p === '/ws/worker') handled = !!workerSocket.handleUpgrade(req, socket, head);
      else if (p === '/ws/lineforge') handled = !!lineforgeCollab.handleUpgrade(req, socket, head);
      else if (p === '/ws/crew-presence') handled = !!crewPresence.handleUpgrade(req, socket, head);
      else if (p === '/ws/localstorage-sync') handled = !!localStorageSyncWsService.handleUpgrade(req, socket, head);
      else handled = false;
    } catch (e) {
      console.error(e);
      handled = false;
    } finally {
      socket.write = rawWrite;
    }

    if (!handled) {
      if (wrote101 || socket.__wsUpgraded) {
        if (!socket.destroyed) socket.destroy();
        return;
      }
      if (!socket.destroyed) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      }
    }
  });

  return server;
}

export async function startServer({
  port = Number(process.env.PORT) || 3000,
  host = '0.0.0.0',
  redisStoreFactory = createRedisLocalStorageSyncStore,
  ...opts
} = {}) {
  const resolvedOpts = { ...opts };

  if (!resolvedOpts.localStorageSyncStore) {
    try {
      const redisBackedStore = await redisStoreFactory();
      if (redisBackedStore) {
        resolvedOpts.localStorageSyncStore = redisBackedStore;
      }
    } catch (err) {
      const message = err?.message || String(err);
      console.warn(`Redis localstorage sync unavailable, using in-memory store: ${message}`);
    }
  }

  const server = createSurveyServer(resolvedOpts);

  if (resolvedOpts.localStorageSyncStore && typeof resolvedOpts.localStorageSyncStore.close === 'function') {
    server.on('close', () => {
      Promise.resolve(resolvedOpts.localStorageSyncStore.close()).catch(() => {});
    });
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.on('uncaughtException', (err) => {
    console.error(`Uncaught exception: ${err?.stack || err?.message || err}`);
    process.exitCode = 1;
  });

  process.on('unhandledRejection', (reason) => {
    console.error(`Unhandled rejection: ${reason?.stack || reason?.message || reason}`);
  });

  startServer().then((server) => {
    const addr = server.address();
    const display = typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`;
    console.log(`survey-cad server listening on ${display}`);
  }).catch((err) => {
    const message = err?.stack || err?.message || String(err);
    console.error(`Failed to start survey-cad server: ${message}`);
    process.exitCode = 1;
  });
}
