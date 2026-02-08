import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SurveyCadClient from './survey-api.js';
import { createRosOcrApp } from './ros-ocr-api.js';

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

async function serveStaticFile(urlPath, staticDir, res) {
  const requested = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const safePath = requested.replace(/^\/+/, '');
  const absPath = await resolveStaticPath(staticDir, safePath);

  if (!absPath.startsWith(path.resolve(staticDir))) {
    sendJson(res, 403, { error: 'Forbidden path.' });
    return;
  }

  try {
    const body = await readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found.' });
  }
}

async function resolveStaticPath(staticDir, safePath) {
  const base = path.resolve(staticDir);
  const initialPath = path.resolve(base, safePath);

  if (initialPath.startsWith(base)) {
    try {
      await readFile(initialPath);
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
} = {}) {
  let rosOcrHandlerPromise = rosOcrHandler ? Promise.resolve(rosOcrHandler) : null;

  return createServer(async (req, res) => {
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

      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Only GET is supported.' });
        return;
      }

      if (urlObj.pathname === '/health') {
        sendJson(res, 200, { ok: true });
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
        const subdivision = await client.loadSubdivisionAtPoint(lon, lat, outSR);
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
