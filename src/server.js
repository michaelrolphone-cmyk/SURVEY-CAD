import { createServer } from 'node:http';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SurveyCadClient from './survey-api.js';
import { createRosOcrApp } from './ros-ocr-api.js';
import { listApps } from './app-catalog.js';
import { buildProjectArchivePlan, createProjectFile } from './project-file.js';
import { LocalStorageSyncStore } from './localstorage-sync-store.js';
import { createLineforgeCollabService } from './lineforge-collab.js';
import { loadFldConfig } from './fld-config.js';

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
  if (/^HTTP\s+\d{3}:/i.test(message)) {
    return 502;
  }
  return 400;
}


function parseRemotePdfUrl(urlObj) {
  const rawUrl = urlObj.searchParams.get('url');
  if (!rawUrl) {
    throw new Error('url query parameter is required.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('url query parameter must be a valid absolute URL.');
  }

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
  return {
    x: Math.min(Math.max(x, 0), n - 1),
    y: Math.min(Math.max(y, 0), n - 1),
    zoom,
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
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
  if (isSmallStaticAsset(absPath)) {
    return 'public, max-age=31536000, immutable';
  }

  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.html') {
    return 'no-cache';
  }
  return 'public, max-age=300';
}

async function readStaticAsset(absPath) {
  const cached = smallStaticAssetCache.get(absPath);
  if (cached) {
    return cached;
  }

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
    } catch {
      // Fall through and attempt case-insensitive matching.
    }
  }

  const segments = safePath.split('/').filter(Boolean);
  let currentDir = base;

  for (const segment of segments) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const matched = entries.find((entry) => entry.name === segment)
      || entries.find((entry) => entry.name.toLowerCase() === segment.toLowerCase());

    if (!matched) {
      return initialPath;
    }

    currentDir = path.resolve(currentDir, matched.name);
  }

  return currentDir;
}

export function createSurveyServer({
  client = new SurveyCadClient(),
  staticDir = DEFAULT_STATIC_DIR,
  rosOcrHandler,
  staticMapFetcher = fetch,
  localStorageSyncStore = new LocalStorageSyncStore(),
} = {}) {
  let rosOcrHandlerPromise = rosOcrHandler ? Promise.resolve(rosOcrHandler) : null;
  const lineforgeCollab = createLineforgeCollabService();

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
        if (!rosOcrHandlerPromise) {
          rosOcrHandlerPromise = createRosOcrApp();
        }
        const app = await rosOcrHandlerPromise;
        app(req, res);
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


      if (urlObj.pathname === '/api/localstorage-sync') {
        if (req.method === 'GET') {
          sendJson(res, 200, localStorageSyncStore.getState());
          return;
        }

        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          const result = localStorageSyncStore.syncIncoming({
            version: body.version,
            snapshot: body.snapshot,
          });
          sendJson(res, 200, result);
          return;
        }

        sendJson(res, 405, { error: 'Only GET and POST are supported.' });
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
            } catch {
              continue;
            }

            if (!upstream.ok) {
              continue;
            }

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
          if (outSR !== 4326) {
            subdivision = await client.loadSubdivisionAtPoint(lon, lat, 4326);
          } else {
            throw err;
          }
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

        if (!pdfResponse.ok) {
          throw new Error(`HTTP ${pdfResponse.status}: ${remoteUrl}`);
        }

        const contentType = pdfResponse.headers.get('content-type') || 'application/pdf';
        const contentDisposition = pdfResponse.headers.get('content-disposition');
        const body = Buffer.from(await pdfResponse.arrayBuffer());

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        if (contentDisposition) {
          res.setHeader('Content-Disposition', contentDisposition);
        }
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
    const handled = lineforgeCollab.handleUpgrade(req, socket, head);
    if (!handled && !socket.destroyed) {
      socket.destroy();
    }
  });

  return server;
}

export function startServer({ port = Number(process.env.PORT) || 3000, host = '0.0.0.0', ...opts } = {}) {
  const server = createSurveyServer(opts);
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().then((server) => {
    const addr = server.address();
    const display = typeof addr === 'string' ? addr : `${addr.address}:${addr.port}`;
    console.log(`survey-cad server listening on ${display}`);
  });
}
